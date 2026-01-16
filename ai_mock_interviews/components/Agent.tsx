"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { vapi } from "@/lib/vapi.sdk";
import { interviewer, interviewer1, interviewer2, interviewer3 } from "@/constants";
import { createFeedback } from "@/lib/actions/general.action";
import { PicovoiceVoiceRecognition } from "@/lib/picovoice";

enum CallStatus {
  INACTIVE = "INACTIVE",
  CONNECTING = "CONNECTING",
  ACTIVE = "ACTIVE",
  FINISHED = "FINISHED",
}

interface SavedMessage {
  role: "user" | "system" | "assistant";
  content: string;
}

/** Minimal Message shape expected from vapi events — adjust to match your SDK */
type VapiMessage = {
  type?: string;
  transcriptType?: string;
  transcript?: string;
  role?: "user" | "assistant" | "system";
  // other fields...
};

type AgentProps = {
  userName?: string;
  userId?: string;
  interviewId?: string;
  feedbackId?: string;
  type?: "generate" | "feedback";
  questions?: string[];
};

const Agent = ({
  userName,
  userId,
  interviewId,
  feedbackId,
  type,
  questions,
}: AgentProps) => {
  const router = useRouter();
  const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastMessage, setLastMessage] = useState<string>("");
  
  // Camera and video state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [currentInterviewerIndex, setCurrentInterviewerIndex] = useState(0);
  
  // Interviewer names based on gender
  const interviewerNames = [
    { name: "John", gender: "male" },
    { name: "Michael", gender: "male" },
    { name: "Sarah", gender: "female" }
  ];
  
  // Voice recognition state
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const enrollmentAudioRef = useRef<Float32Array[]>([]);
  const enrollmentStartTimeRef = useRef<number | null>(null);
  const voiceProfileRef = useRef<any>(null);
  const isEnrollingRef = useRef(false);
  const enrollmentCompleteRef = useRef(false);
  const voiceVerificationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const picovoiceRef = useRef<PicovoiceVoiceRecognition | null>(null);

  // build-time env var (NEXT_PUBLIC_ is safe to access in client builds)
  const WORKFLOW_ID = process.env.NEXT_PUBLIC_VAPI_WORKFLOW_ID ?? "";
  const PICOVOICE_ACCESS_KEY = process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY ?? "";

  // Update video element when stream changes
  useEffect(() => {
    if (videoStream && videoRef.current) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch((err) => {
        console.error("Error playing video:", err);
      });
    }
    
    return () => {
      if (videoStream) {
        videoStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      }
    };
  }, [videoStream]);

  // Voice recognition initialization and enrollment
  useEffect(() => {
    if (callStatus === CallStatus.ACTIVE && !isEnrollingRef.current && !enrollmentCompleteRef.current) {
      startVoiceEnrollment();
    }

    return () => {
      if (voiceVerificationIntervalRef.current) {
        clearInterval(voiceVerificationIntervalRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [callStatus]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user" }, 
        audio: true 
      });
      setVideoStream(stream);
      
      // Use setTimeout to ensure video element is ready
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((err) => {
            console.error("Error playing video:", err);
          });
        }
      }, 100);
    } catch (error) {
      console.error("Error accessing camera:", error);
      alert("Camera access denied. Please allow camera access to continue.");
    }
  };

  const startVoiceEnrollment = async () => {
    if (!PICOVOICE_ACCESS_KEY) {
      console.warn("PICOVOICE_ACCESS_KEY not found. Voice verification disabled.");
      return;
    }

    try {
      // Initialize Picovoice
      picovoiceRef.current = new PicovoiceVoiceRecognition(PICOVOICE_ACCESS_KEY);
      try {
        await picovoiceRef.current.initializeProfiler();
      } catch (err) {
        console.warn("Picovoice SDK not available, using fallback voice verification:", err);
      }

      isEnrollingRef.current = true;
      enrollmentStartTimeRef.current = Date.now();
      enrollmentAudioRef.current = [];

      // Get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = async (e: AudioProcessingEvent) => {
        if (!isEnrollingRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const audioData = new Float32Array(inputData.length);
        audioData.set(inputData);
        enrollmentAudioRef.current.push(audioData);

        // Try to enroll with Picovoice if available
        if (picovoiceRef.current && picovoiceRef.current.profiler) {
          try {
            const percentage = await picovoiceRef.current.enrollVoice(audioData);
            console.log(`Enrollment progress: ${percentage}%`);
          } catch (err) {
            // If Picovoice SDK is not installed, just collect audio samples
            console.log("Picovoice enrollment not available, collecting audio samples only");
          }
        }

        // Check if 30 seconds have passed
        if (enrollmentStartTimeRef.current && Date.now() - enrollmentStartTimeRef.current >= 30000) {
          isEnrollingRef.current = false;
          processor.disconnect();
          await completeEnrollment();
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      console.log("Voice enrollment started. Please speak for 30 seconds...");
    } catch (error) {
      console.error("Error starting voice enrollment:", error);
      isEnrollingRef.current = false;
    }
  };

  const completeEnrollment = async () => {
    try {
      if (picovoiceRef.current) {
        // Complete enrollment with Picovoice
        const profile = await picovoiceRef.current.completeEnrollment();
        voiceProfileRef.current = profile;
        console.log("Voice enrollment completed with Picovoice. Profile ID:", profile.profileId);
      } else {
        // Fallback: store audio samples as reference
        console.log("Voice enrollment completed. Audio samples collected:", enrollmentAudioRef.current.length);
        voiceProfileRef.current = { audioSamples: enrollmentAudioRef.current };
      }
      
      enrollmentCompleteRef.current = true;
      startVoiceVerification();
    } catch (error) {
      console.error("Error completing enrollment:", error);
      // Fallback: continue without Picovoice
      enrollmentCompleteRef.current = true;
      startVoiceVerification();
    }
  };

  const startVoiceVerification = async () => {
    if (!mediaStreamRef.current || !audioContextRef.current) return;

    // Initialize Eagle for verification if Picovoice is available
    if (picovoiceRef.current && voiceProfileRef.current && 'profileId' in voiceProfileRef.current) {
      try {
        await picovoiceRef.current.initializeEagle([voiceProfileRef.current]);
      } catch (error) {
        console.warn("Could not initialize Eagle, using fallback verification:", error);
      }
    }

    // Verify voice every 5 seconds
    voiceVerificationIntervalRef.current = setInterval(async () => {
      try {
        // Capture a small audio sample
        const audioContext = audioContextRef.current!;
        const source = audioContext.createMediaStreamSource(mediaStreamRef.current!);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        const audioSamples: Float32Array[] = [];
        let sampleCount = 0;

        processor.onaudioprocess = async (e: AudioProcessingEvent) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const audioData = new Float32Array(inputData.length);
          audioData.set(inputData);
          audioSamples.push(audioData);
          sampleCount++;

          // Collect 1 second of audio (approximately)
          if (sampleCount >= 10) {
            processor.disconnect();
            await verifyVoiceSample(audioSamples);
          }
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
      } catch (error) {
        console.error("Error in voice verification:", error);
      }
    }, 5000);
  };

  const verifyVoiceSample = async (audioSamples: Float32Array[]) => {
    try {
      if (picovoiceRef.current && voiceProfileRef.current && 'profileId' in voiceProfileRef.current) {
        // Use Picovoice Eagle for verification
        try {
          // Combine audio samples into a single array
          const totalLength = audioSamples.reduce((sum, sample) => sum + sample.length, 0);
          const combinedAudio = new Float32Array(totalLength);
          let offset = 0;
          for (const sample of audioSamples) {
            combinedAudio.set(sample, offset);
            offset += sample.length;
          }

          const scores = await picovoiceRef.current.verifyVoice(combinedAudio);
          const isMatch = picovoiceRef.current.isVoiceMatch(scores, 0.7);

          if (!isMatch) {
            console.warn("Voice mismatch detected! Possible cheating detected.");
            alert("Warning: Voice mismatch detected. Please ensure you are the same person who started the interview.");
          }
        } catch (error) {
          console.error("Error in Picovoice verification:", error);
          // Fallback to basic similarity check
          const similarityScore = calculateBasicSimilarity(audioSamples);
          if (similarityScore < 0.7) {
            console.warn("Voice mismatch detected! Possible cheating detected.");
            alert("Warning: Voice mismatch detected. Please ensure you are the same person who started the interview.");
          }
        }
      } else {
        // Fallback: basic similarity check
        const similarityScore = calculateBasicSimilarity(audioSamples);
        if (similarityScore < 0.7) {
          console.warn("Voice mismatch detected! Possible cheating detected.");
          alert("Warning: Voice mismatch detected. Please ensure you are the same person who started the interview.");
        }
      }
    } catch (error) {
      console.error("Error verifying voice sample:", error);
    }
  };

  const calculateBasicSimilarity = (audioSamples: Float32Array[]): number => {
    // Basic similarity check based on audio characteristics
    // This is a simplified version - Picovoice Eagle provides much better accuracy
    if (!voiceProfileRef.current || !('audioSamples' in voiceProfileRef.current)) {
      return 0.85; // Default if no enrollment data
    }

    const enrolledSamples = voiceProfileRef.current.audioSamples as Float32Array[];
    if (enrolledSamples.length === 0) return 0.85;

    // Calculate average amplitude for comparison (simplified)
    const currentAvg = audioSamples.reduce((sum, sample) => {
      const sampleAvg = Array.from(sample).reduce((s, v) => s + Math.abs(v), 0) / sample.length;
      return sum + sampleAvg;
    }, 0) / audioSamples.length;

    const enrolledAvg = enrolledSamples.reduce((sum, sample) => {
      const sampleAvg = Array.from(sample).reduce((s, v) => s + Math.abs(v), 0) / sample.length;
      return sum + sampleAvg;
    }, 0) / enrolledSamples.length;

    // Calculate similarity (1 - normalized difference)
    const diff = Math.abs(currentAvg - enrolledAvg);
    const maxAvg = Math.max(currentAvg, enrolledAvg);
    const similarity = maxAvg > 0 ? 1 - (diff / maxAvg) : 0.85;

    return Math.max(0, Math.min(1, similarity));
  };

  useEffect(() => {
    const onCallStart = () => {
      setCallStatus(CallStatus.ACTIVE);
    };

    const onCallEnd = () => {
      setCallStatus(CallStatus.FINISHED);
    };

    const onMessage = (message: VapiMessage) => {
      // Only persist unique final transcripts; ignore duplicate finals that some providers resend
      if (
        message?.type === "transcript" &&
        message?.transcriptType === "final" &&
        typeof message?.transcript === "string"
      ) {
        const trimmed = message.transcript.trim();
        setMessages((prev: SavedMessage[]) => {
          const last = prev[prev.length - 1]?.content?.trim();
          if (last && last === trimmed) return prev;
          return [
            ...prev,
            { role: (message.role as SavedMessage["role"]) ?? "assistant", content: trimmed },
          ];
        });
        
        // Rotate to next interviewer if assistant message indicates question completion
        if (message.role === "assistant" && trimmed.length > 0) {
          // Check if this is a question (contains question mark or is a question pattern)
          if (trimmed.includes("?") || trimmed.toLowerCase().includes("tell me") || trimmed.toLowerCase().includes("what") || trimmed.toLowerCase().includes("how")) {
            // After a delay, rotate to next interviewer
            setTimeout(() => {
              setCurrentInterviewerIndex((prev: number) => (prev + 1) % 3);
            }, 2000);
          }
        }
      }
    };

    const onSpeechStart = () => {
      console.log("speech start");
      setIsSpeaking(true);
    };

    const onSpeechEnd = () => {
      console.log("speech end");
      setIsSpeaking(false);
    };

    const onError = async (error: any) => {
      console.error("Vapi error event:", error);
      let errorMessage = "Failed to start interview. Please try again.";
      let shouldShowAlert = true;
      
      // if the SDK provided a Response object, try to read it
      try {
        if (error && error instanceof Response) {
          const text = await error.text();
          console.error("Vapi response body:", text);
        } else if (error && error.error && error.error instanceof Response) {
          const text = await error.error.text();
          console.error("Vapi response body (nested):", text);
        } else if (error && typeof error === 'object') {
          if (Object.keys(error).length === 0) {
            // Empty error object - might be a connection issue
            console.warn("Vapi connection error - check your VAPI_WEB_TOKEN and network connection");
            errorMessage = "Connection error. Please check your VAPI token and network connection.";
          } else {
            // Parse error details
            const errorDetails = JSON.stringify(error, null, 2);
            console.error("Vapi error details:", errorDetails);
            
            // Check for "Meeting has ended" - this is normal when call ends, don't show alert
            if (errorDetails.includes("Meeting has ended") || errorDetails.includes("ejected")) {
              console.log("Meeting ended normally");
              shouldShowAlert = false;
            }
            // Check for assistant ID error
            else if (errorDetails.includes("assistantId") && errorDetails.includes("Does Not Exist")) {
              errorMessage = "Assistant ID not found. Please check your VAPI configuration.";
            } else if (error?.error?.message) {
              const msg = error.error.message;
              if (typeof msg === 'object' && msg.msg === "Meeting has ended") {
                shouldShowAlert = false;
              } else {
                errorMessage = typeof msg === 'string' ? msg : (msg.msg || "Unknown error");
              }
            }
          }
        }
      } catch (ex) {
        console.error("Error reading Vapi error body:", ex);
      }
      
      // Only update status if it's not a normal end
      if (shouldShowAlert) {
        setCallStatus(CallStatus.INACTIVE);
        // Show user-friendly error
        alert(errorMessage);
      } else {
        // Meeting ended normally, just update status
        setCallStatus(CallStatus.FINISHED);
      }
    };

    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd);
    vapi.on("message", onMessage);
    vapi.on("speech-start", onSpeechStart);
    vapi.on("speech-end", onSpeechEnd);
    vapi.on("error", onError);

    return () => {
      vapi.off("call-start", onCallStart);
      vapi.off("call-end", onCallEnd);
      vapi.off("message", onMessage);
      vapi.off("speech-start", onSpeechStart);
      vapi.off("speech-end", onSpeechEnd);
      vapi.off("error", onError);
    };
  }, []);

  useEffect(() => {
    const handleGenerateFeedback = async (messages: SavedMessage[]) => {
      try {
        const { success, feedbackId: id } = await createFeedback({
          interviewId: interviewId!,
          userId: userId!,
          transcript: messages,
          feedbackId,
        });

        if (success && id) {
          router.push(`/interview/${interviewId}/feedback`);
        } else {
          console.log("Error saving feedback");
          router.push("/");
        }
      } catch (err) {
        console.error("createFeedback error:", err);
        router.push("/");
      }
    };

    if (callStatus === CallStatus.FINISHED) {
      if (type === "generate") {
        router.push("/");
      } else {
        handleGenerateFeedback(messages);
      }
    }
  }, [messages, callStatus, feedbackId, interviewId, router, type, userId]);

  const getCurrentInterviewer = () => {
    const interviewers = [interviewer1, interviewer2, interviewer3];
    return interviewers[currentInterviewerIndex % 3];
  };

  const handleCall = async () => {
    // Start camera immediately when Call button is pressed
    await startCamera();

    // validate workflow id(s) before starting
    setCallStatus(CallStatus.CONNECTING);

    // Reset interviewer index
    setCurrentInterviewerIndex(0);

    // For interview type, we'll use the interviewer configuration directly
    // For generate type, use workflow ID
    if (type === "generate" && !WORKFLOW_ID) {
      console.error("No workflow id provided. Check NEXT_PUBLIC_VAPI_WORKFLOW_ID.");
      setCallStatus(CallStatus.INACTIVE);
      return;
    }

    try {
      if (type === "generate") {
        await vapi.start(WORKFLOW_ID, {
          variableValues: {
            username: userName ?? "",
            userid: userId ?? "",
          },
        });
      } else {
        // Use all questions - interviewers will rotate during the interview
        // Start with the first interviewer (index 0)
        const formattedQuestions = (questions || []).map((q) => `- ${q}`).join("\n");
        
        // Use the first interviewer configuration (interviewer1)
        // Vapi accepts CreateAssistantDTO directly
        await vapi.start(interviewer1, {
          variableValues: {
            questions: formattedQuestions,
            interviewerNumber: 1,
            totalInterviewers: 3,
            currentInterviewerName: interviewerNames[0].name,
          },
        });
      }
      // if start resolves, callStatus will be set via onCallStart event
    } catch (e: any) {
      console.error("vapi.start threw:", e);
      // try to read any Response body inside the thrown error
      try {
        if (e && e instanceof Response) {
          const text = await e.text();
          console.error("Server response:", text);
        } else if (e && e.error && e.error instanceof Response) {
          const text = await e.error.text();
          console.error("Server response (nested):", text);
        } else if (e && typeof e === 'object') {
          // Check for common error patterns
          if (Object.keys(e).length === 0) {
            console.error("Empty error object - check VAPI_WEB_TOKEN and network connection");
          } else {
            console.error("Error details:", JSON.stringify(e, null, 2));
          }
        }
      } catch (ex) {
        console.error("Failed reading thrown error body:", ex);
      }
      setCallStatus(CallStatus.INACTIVE);
      // Show user-friendly error message
      alert("Failed to start interview. Please check your connection and try again.");
    }
  };

  const handleDisconnect = () => {
    setCallStatus(CallStatus.FINISHED);
    try {
      vapi.stop();
    } catch (err) {
      console.error("Error stopping vapi:", err);
      setCallStatus(CallStatus.INACTIVE);
    }
    
    // Stop video stream
    if (videoStream) {
      videoStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setVideoStream(null);
    }
    
    // Stop voice verification
    if (voiceVerificationIntervalRef.current) {
      clearInterval(voiceVerificationIntervalRef.current);
      voiceVerificationIntervalRef.current = null;
    }
    
    // Stop audio stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (picovoiceRef.current) {
      picovoiceRef.current.release();
      picovoiceRef.current = null;
    }
  };

  return (
    <>
      <div className="call-view">
        {/* Interviewers Panel - 3 boxes vertically */}
        <div className="flex flex-col gap-4 flex-1 sm:basis-1/2 w-full max-w-md">
          {interviewerNames.map((interviewer, index) => (
            <div
              key={index}
              className={`card-interviewer min-h-[120px] ${
                currentInterviewerIndex === index ? 'border-2 border-primary-200 ring-2 ring-primary-200/50' : 'border-2 border-primary-200/30'
              }`}
            >
              <div className="avatar size-[60px]">
                <Image
                  src="/ai-avatar.png"
                  alt="profile-image"
                  width={50}
                  height={50}
                  className="object-cover rounded-full"
                />
                {isSpeaking && currentInterviewerIndex === index && (
                  <span className="animate-speak" />
                )}
              </div>
              <h3 className="text-lg font-semibold mt-2">{interviewer.name}</h3>
              <p className="text-xs text-light-400 capitalize">{interviewer.gender}</p>
            </div>
          ))}
        </div>

        {/* User Profile Card with Video */}
        <div className="card-border flex-1 sm:basis-1/2 w-full min-h-[400px]">
          <div className="card-content">
            <div className="relative w-[200px] h-[200px] flex items-center justify-center">
              {videoStream ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="rounded-full object-cover w-full h-full bg-dark-200"
                  style={{ transform: 'scaleX(-1)' }} // Mirror the video
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      videoRef.current.play().catch(console.error);
                    }
                  }}
                />
              ) : (
                <Image
                  src="/user-avatar.png"
                  alt="profile-image"
                  width={200}
                  height={200}
                  className="rounded-full object-cover w-full h-full"
                />
              )}
            </div>
            <h3 className="mt-4">{userName}</h3>
            {isEnrollingRef.current && (
              <p className="text-xs text-yellow-400 mt-2">
                Voice enrollment in progress... ({Math.floor((Date.now() - (enrollmentStartTimeRef.current || Date.now())) / 1000)}s)
              </p>
            )}
          </div>
        </div>
      </div>

      {messages.length > 0 && (
        <div className="transcript-border">
          <div className="transcript">
            {(() => {
              const last = messages[messages.length - 1];
              return (
                <p key={`${last.content}-${messages.length - 1}`} className={cn("transition-opacity duration-500", "animate-fadeIn")}>
                  {last.content}
                </p>
              );
            })()}
          </div>
        </div>
      )}

      <div className="w-full flex justify-center">
        {callStatus !== CallStatus.ACTIVE ? (
          <button className="relative btn-call" onClick={() => handleCall()}>
            <span
              className={cn(
                "absolute animate-ping rounded-full opacity-75",
                callStatus !== CallStatus.CONNECTING && "hidden"
              )}
            />
            <span className="relative">
              {callStatus === CallStatus.INACTIVE || callStatus === CallStatus.FINISHED ? "Call" : ". . ."}
            </span>
          </button>
        ) : (
          <button className="btn-disconnect" onClick={() => handleDisconnect()}>
            End
          </button>
        )}
      </div>
    </>
  );
};

export default Agent;
