# Interview System Modifications Summary

## Overview
This document summarizes the modifications made to support:
1. Multiple interviewers (3 interviewers: 2 male, 1 female) asking questions one by one
2. Camera access and video display when interview starts
3. Voice recognition using Picovoice to verify interviewer voice consistency

## Changes Made

### 1. Multiple Interviewers Support

#### File: `constants/index.ts`
- Added three interviewer configurations:
  - `interviewer1`: Male voice 1 (voiceId: "adam")
  - `interviewer2`: Male voice 2 (voiceId: "josh")
  - `interviewer3`: Female voice (voiceId: "sarah")
- Each interviewer has a system prompt indicating they are part of a panel of 3 interviewers
- Interviewers are configured to ask questions one by one

#### File: `components/Agent.tsx`
- Added `currentInterviewerIndex` state to track which interviewer is currently active
- Modified `handleCall` to distribute questions among 3 interviewers
- Added logic to rotate between interviewers when questions are answered
- Updated UI to show current interviewer number and gender

### 2. Camera Access and Video Display

#### File: `components/Agent.tsx`
- Added `videoRef` to reference the video element
- Added `videoStream` state to manage the camera stream
- Created `startCamera()` function that:
  - Requests camera and microphone access using `getUserMedia`
  - Displays the video feed in the user profile card
  - Mirrors the video for natural appearance
- Camera access is triggered when interview status changes to CONNECTING or ACTIVE
- Video stream is properly cleaned up when interview ends

### 3. Voice Recognition with Picovoice

#### File: `lib/picovoice.ts` (NEW)
- Created a new helper class `PicovoiceVoiceRecognition` that:
  - Initializes Picovoice Eagle Profiler for voice enrollment
  - Enrolls voice samples during the first 30 seconds
  - Exports voice profile for later verification
  - Initializes Eagle for continuous voice verification
  - Verifies voice samples against enrolled profile
  - Provides fallback mode if Picovoice SDK is not available

#### File: `components/Agent.tsx`
- Added voice recognition state management:
  - `picovoiceRef`: Reference to Picovoice instance
  - `enrollmentAudioRef`: Stores audio samples during enrollment
  - `enrollmentStartTimeRef`: Tracks enrollment start time
  - `voiceProfileRef`: Stores the enrolled voice profile
  - `isEnrollingRef`: Tracks enrollment status
  - `enrollmentCompleteRef`: Tracks if enrollment is complete
  - `voiceVerificationIntervalRef`: Interval for periodic verification

- Implemented `startVoiceEnrollment()`:
  - Initializes Picovoice with access key
  - Captures audio stream for 30 seconds
  - Enrolls voice samples using Picovoice Eagle Profiler
  - Falls back to basic audio collection if Picovoice is unavailable

- Implemented `completeEnrollment()`:
  - Completes voice enrollment and exports profile
  - Starts voice verification process

- Implemented `startVoiceVerification()`:
  - Sets up periodic voice verification every 5 seconds
  - Captures 1-second audio samples
  - Compares samples with enrolled profile

- Implemented `verifyVoiceSample()`:
  - Uses Picovoice Eagle to verify voice similarity
  - Alerts if voice mismatch is detected (similarity < 70%)
  - Falls back to basic similarity check if Picovoice unavailable

- Implemented `calculateBasicSimilarity()`:
  - Fallback method for voice verification
  - Compares audio characteristics when Picovoice is not available

#### File: `README_PICOVOICE.md` (NEW)
- Created documentation for Picovoice integration
- Includes setup instructions, troubleshooting, and usage guide

## Environment Variables Required

Add to `.env.local`:
```env
NEXT_PUBLIC_PICOVOICE_ACCESS_KEY=your_picovoice_access_key_here
```

## Dependencies to Install

```bash
npm install @picovoice/eagle-web
```

## How It Works

### Interview Flow:
1. User clicks "Call" button
2. Camera access is requested and video is displayed
3. Interview starts with Interviewer 1 (Male 1)
4. Voice enrollment begins (first 30 seconds)
5. Interviewer 1 asks questions
6. After questions are answered, rotates to Interviewer 2 (Male 2)
7. Then rotates to Interviewer 3 (Female)
8. Voice verification runs continuously every 5 seconds
9. If voice mismatch detected, alert is shown

### Voice Verification:
- **Enrollment Phase (0-30 seconds)**: Captures interviewer's voice and creates voice profile
- **Verification Phase (After 30 seconds)**: Every 5 seconds, verifies current voice against enrolled profile
- **Mismatch Detection**: If similarity score < 70%, alerts user about possible cheating

## Notes

- The system gracefully falls back to basic voice verification if Picovoice SDK is not installed
- Camera access requires HTTPS in production (or localhost for development)
- Voice verification runs in the background and doesn't interrupt the interview flow
- Multiple interviewers rotate automatically based on question completion
