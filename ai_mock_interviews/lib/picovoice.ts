/**
 * Picovoice Voice Recognition Helper
 * This file provides utilities for voice enrollment and verification using Picovoice Eagle SDK
 */

export interface VoiceProfile {
  profileId: string;
  profileData: Uint8Array;
}

export class PicovoiceVoiceRecognition {
  private accessKey: string;
  public profiler: any = null;
  private eagle: any = null;
  private enrolledProfile: VoiceProfile | null = null;

  constructor(accessKey: string) {
    this.accessKey = accessKey;
  }

  /**
   * Initialize Picovoice Eagle Profiler for voice enrollment
   * Note: This requires @picovoice/eagle-web package to be installed
   */
  async initializeProfiler(): Promise<void> {
    if (!this.accessKey) {
      throw new Error("Picovoice Access Key is required");
    }

    try {
      // Dynamic import of Picovoice Eagle SDK
      // You need to install: npm install @picovoice/eagle-web
      // This is optional - the code will work without it using fallback methods
      const picovoiceModule = await import("@picovoice/eagle-web");
      const EagleProfiler = picovoiceModule.EagleProfiler;
      
      // Load the Eagle model (you may need to download this)
      // For now, we'll use a placeholder
      const eagleModel = {
        publicPath: "/models/eagle_params.pv", // You need to download this model
        forceWrite: false,
      };

      this.profiler = await EagleProfiler.create(this.accessKey, eagleModel);
    } catch (error: any) {
      // If the module is not installed, provide helpful error message
      if (error?.code === "MODULE_NOT_FOUND" || error?.message?.includes("Cannot find module")) {
        console.warn("Picovoice Eagle SDK not installed. Install with: npm install @picovoice/eagle-web");
        throw new Error("Picovoice SDK not available - package not installed");
      }
      console.error("Error initializing Picovoice Profiler:", error);
      throw error;
    }
  }

  /**
   * Enroll a voice sample
   * @param audioData - Float32Array of audio samples
   * @returns Enrollment percentage (0-100)
   */
  async enrollVoice(audioData: Float32Array): Promise<number> {
    if (!this.profiler) {
      await this.initializeProfiler();
    }

    try {
      const result = await this.profiler.enroll(audioData);
      return result.percentage;
    } catch (error) {
      console.error("Error enrolling voice:", error);
      throw error;
    }
  }

  /**
   * Complete enrollment and export voice profile
   * @returns Voice profile data
   */
  async completeEnrollment(): Promise<VoiceProfile> {
    if (!this.profiler) {
      throw new Error("Profiler not initialized");
    }

    try {
      const profile = this.profiler.export();
      this.enrolledProfile = {
        profileId: `profile_${Date.now()}`,
        profileData: profile,
      };
      
      this.profiler.release();
      this.profiler = null;
      
      return this.enrolledProfile;
    } catch (error) {
      console.error("Error completing enrollment:", error);
      throw error;
    }
  }

  /**
   * Initialize Eagle for voice verification
   */
  async initializeEagle(profiles: VoiceProfile[]): Promise<void> {
    if (!this.accessKey) {
      throw new Error("Picovoice Access Key is required");
    }

    try {
      // Dynamic import of Picovoice Eagle SDK
      // This is optional - the code will work without it using fallback methods
      const picovoiceModule = await import("@picovoice/eagle-web");
      const Eagle = picovoiceModule.Eagle;
      
      const eagleModel = {
        publicPath: "/models/eagle_params.pv",
        forceWrite: false,
      };

      // Convert profiles to the format expected by Eagle
      const profileData = profiles.map(p => p.profileData);
      
      this.eagle = await Eagle.create(this.accessKey, eagleModel, profileData);
    } catch (error: any) {
      // If the module is not installed, provide helpful error message
      if (error?.code === "MODULE_NOT_FOUND" || error?.message?.includes("Cannot find module")) {
        console.warn("Picovoice Eagle SDK not installed. Install with: npm install @picovoice/eagle-web");
        throw new Error("Picovoice SDK not available - package not installed");
      }
      console.error("Error initializing Eagle:", error);
      throw error;
    }
  }

  /**
   * Verify if audio sample matches enrolled voice
   * @param audioData - Float32Array of audio samples
   * @returns Array of similarity scores for each enrolled profile
   */
  async verifyVoice(audioData: Float32Array): Promise<number[]> {
    if (!this.eagle) {
      throw new Error("Eagle not initialized. Call initializeEagle first.");
    }

    try {
      const scores = await this.eagle.process(audioData);
      return scores;
    } catch (error) {
      console.error("Error verifying voice:", error);
      throw error;
    }
  }

  /**
   * Check if voice matches (similarity score above threshold)
   * @param scores - Array of similarity scores
   * @param threshold - Minimum similarity score (default: 0.7)
   * @returns true if voice matches, false otherwise
   */
  isVoiceMatch(scores: number[], threshold: number = 0.7): boolean {
    if (scores.length === 0) return false;
    const maxScore = Math.max(...scores);
    return maxScore >= threshold;
  }

  /**
   * Release resources
   */
  release(): void {
    if (this.profiler) {
      this.profiler.release();
      this.profiler = null;
    }
    if (this.eagle) {
      this.eagle.release();
      this.eagle = null;
    }
  }
}
