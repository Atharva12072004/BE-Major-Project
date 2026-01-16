# Picovoice Integration Guide

## Setup Instructions

To enable voice recognition using Picovoice, follow these steps:

### 1. Install Picovoice Eagle SDK

```bash
npm install @picovoice/eagle-web
```

### 2. Download Eagle Model Files

You need to download the Eagle model files from Picovoice and place them in the `public/models/` directory:

1. Visit [Picovoice Console](https://console.picovoice.ai/)
2. Download the Eagle model files
3. Place `eagle_params.pv` in `public/models/` directory

### 3. Set Environment Variable

Add your Picovoice Access Key to your `.env.local` file:

```env
NEXT_PUBLIC_PICOVOICE_ACCESS_KEY=your_access_key_here
```

You can get your access key from [Picovoice Console](https://console.picovoice.ai/).

### 4. How It Works

1. **Enrollment Phase (First 30 seconds)**: 
   - When the interview starts, the system captures 30 seconds of the interviewer's voice
   - This creates a voice profile using Picovoice Eagle Profiler
   - The voice profile is stored for later verification

2. **Verification Phase (During Interview)**:
   - Every 5 seconds, the system captures a 1-second audio sample
   - It compares this sample with the enrolled voice profile
   - If the similarity score is below 0.7 (70%), it detects a voice mismatch
   - An alert is shown if voice cheating is detected

### 5. Fallback Mode

If Picovoice SDK is not installed or the access key is missing, the system will:
- Still collect audio samples during enrollment
- Use a basic similarity check based on audio characteristics
- This provides basic voice verification but is less accurate than Picovoice

### 6. Multiple Interviewers

The system supports 3 interviewers (2 male, 1 female) who ask questions one by one. Each interviewer's voice is verified separately during their turn.

## Troubleshooting

- **"PICOVOICE_ACCESS_KEY not found"**: Make sure you've added the access key to your `.env.local` file
- **"Picovoice SDK not available"**: Install the `@picovoice/eagle-web` package
- **Model file not found**: Download and place the Eagle model files in `public/models/` directory
