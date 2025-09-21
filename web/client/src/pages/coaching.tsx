import { useState, useEffect, useRef } from 'react';

// Web Speech API types
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: any) => void;
  onstart: () => void;
  onend: () => void;
  onerror: (event: any) => void;
}
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CameraFeed } from '@/components/camera-feed';
import { MetricsPanel } from '@/components/metrics-panel';
import { PoseOverlay } from '@/components/pose-overlay';
import { usePoseAnalysis } from '@/hooks/use-pose-analysis';
import { useVoiceFeedback } from '@/hooks/use-voice-feedback';
import { useWebSocket } from '@/hooks/use-websocket';
import { apiRequest } from '@/lib/queryClient';
import { SCORE_THRESHOLDS } from '@/lib/constants';
import { 
  Clock, 
  VolumeX, 
  Volume2, 
  Pause, 
  Play, 
  Square, 
  Settings,
  Wifi,
  WifiOff 
} from 'lucide-react';

export default function Coaching() {
  const [match, params] = useRoute('/coaching/:sessionId');
  const [, setLocation] = useLocation();
  const sessionId = params?.sessionId;
  
  const [isRunning, setIsRunning] = useState(false); // Start paused until pose detected
  const [sessionTime, setSessionTime] = useState(0);
  const [lastFeedbackTime, setLastFeedbackTime] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [lastAnnouncementTime, setLastAnnouncementTime] = useState(0);
  const [fullBodyDetected, setFullBodyDetected] = useState(false);
  const [plankTypeDetected, setPlankTypeDetected] = useState(false);
  const [detectedPlankType, setDetectedPlankType] = useState<'high' | 'elbow' | 'unknown'>('unknown');
  const [isListening, setIsListening] = useState(false);
  const [positioningInstructionGiven, setPositioningInstructionGiven] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionStartTime = useRef<number>(0);
  const analysisDataRef = useRef<any[]>([]);
  const recognitionRef = useRef<any>(null);
  const recognitionStartedRef = useRef<boolean>(false);
  const stablePlankTypeRef = useRef<'high' | 'elbow' | 'unknown'>('unknown');
  const stablePlankStartTimeRef = useRef<number>(0);
  const failureStartTimeRef = useRef<number>(0);
  const isAutoStoppingRef = useRef<boolean>(false);

  const { currentAnalysis, currentLandmarks, processResults, startAnalysis, stopAnalysis } = usePoseAnalysis({
    onAnalysisUpdate: (analysis) => {
      // Store analysis data for final calculations - only if we have valid scores
      if (analysis.overallScore > 0) {
        analysisDataRef.current.push({
          ...analysis,
          timestamp: Date.now(),
        });
      }
      
      // Automatic failure detection - check if 2 out of 3 scores are in red zone (below 70)
      if (hasStarted && isRunning && !isAutoStoppingRef.current) {
        const scores = [
          analysis.bodyAlignmentScore,
          analysis.kneePositionScore,
          analysis.shoulderStackScore
        ];
        
        const redZoneCount = scores.filter(score => score < 70).length;
        
        if (redZoneCount >= 2) {
          // Start tracking failure time
          if (failureStartTimeRef.current === 0) {
            failureStartTimeRef.current = Date.now();
            console.log('Form failure detected - starting failure timer');
          } else {
            // Check if form has been poor for 2 seconds
            const failureDuration = Date.now() - failureStartTimeRef.current;
            if (failureDuration >= 2000) {
              console.log('Form failure sustained for 2 seconds - auto stopping session');
              isAutoStoppingRef.current = true;
              speak('Form broken - session ending', 'high');
              setTimeout(() => {
                handleStop();
              }, 1000); // Give time for the voice message
            }
          }
        }
      }
      
      // Check if position is stable (same plank type for 1 second)
      if (analysis.plankType !== 'unknown' && 
          analysis.bodyAlignmentScore >= 40 && 
          analysis.kneePositionScore >= 40) {
        
        const now = Date.now();
        
        // If plank type changed, reset stability timer
        if (analysis.plankType !== stablePlankTypeRef.current) {
          stablePlankTypeRef.current = analysis.plankType;
          stablePlankStartTimeRef.current = now;
        }
        
        // Check if position has been stable for 1 second
        const stableForMs = now - stablePlankStartTimeRef.current;
        
        // If stable for 1 second and not yet identified
        if (!plankTypeDetected && stableForMs >= 800) {
          setPlankTypeDetected(true);
          setDetectedPlankType(analysis.plankType);
          setFullBodyDetected(true);
          
          // Announce the specific plank type
          const announcement = analysis.plankType === 'high' 
            ? 'High plank identified' 
            : 'Elbow plank identified';
          speak(announcement, 'high');
          
          // Start timer after identification
          if (!hasStarted) {
            setTimeout(() => {
              setHasStarted(true);
              setIsRunning(true);
              sessionStartTime.current = Date.now();
              setLastAnnouncementTime(Date.now());
              speak('Timer started', 'high');
              
              // Tell user how to stop the session (only if voice commands are available)
              setTimeout(() => {
                if (recognitionRef.current) {
                  speak('Say stop to end your session', 'high');
                }
              }, 2000);
            }, 1500);
          }
        }
      } else {
        // Reset stability tracking if position is lost
        if (stablePlankTypeRef.current !== 'unknown') {
          stablePlankTypeRef.current = 'unknown';
          stablePlankStartTimeRef.current = 0;
        }
      }
      
      // Send real-time data via WebSocket
      // Send real-time data via WebSocket
      if (isConnected && sessionId) {
        sendMessage({
          type: 'pose_analysis',
          sessionId,
          data: {
            bodyAlignmentAngle: analysis.bodyAlignmentAngle,
            kneeAngle: analysis.kneeAngle,
            shoulderStackAngle: analysis.shoulderStackAngle,
            bodyAlignmentScore: analysis.bodyAlignmentScore,
            kneePositionScore: analysis.kneePositionScore,
            shoulderStackScore: analysis.shoulderStackScore,
            overallScore: analysis.overallScore,
            feedback: analysis.feedback.join(', '),
          },
        });
      }
    },
  });

  const { speak, toggle: toggleVoice, isEnabled: voiceEnabled } = useVoiceFeedback();
  const { isConnected, sendMessage, connect, disconnect } = useWebSocket();

  // Give positioning instructions when user is first detected
  useEffect(() => {
    if (currentLandmarks && currentLandmarks.length > 0 && !positioningInstructionGiven && voiceEnabled) {
      const positioningMessage = "Place your phone on the ground in landscape mode, leaning securely against an object. Position yourself sideways to the camera, not facing it, so your whole body is visible. When you're ready, I'll start detecting your plank and begin the timer.";
      speak(positioningMessage, 'high');
      setPositioningInstructionGiven(true);
    }
  }, [currentLandmarks, positioningInstructionGiven, voiceEnabled, speak]);

  // Fetch session data
  const { data: session } = useQuery({
    queryKey: ['/api/sessions', sessionId],
    enabled: !!sessionId,
  });

  // Update session mutation
  const updateSession = useMutation({
    mutationFn: async (updates: any) => {
      const response = await apiRequest('PATCH', `/api/sessions/${sessionId}`, updates);
      return response.json();
    },
  });

  // Timer effect with voice announcements every 10 seconds
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRunning && hasStarted) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - sessionStartTime.current) / 1000);
        setSessionTime(elapsed);
        
        // Voice announcement every 10 seconds
        if (elapsed > 0 && elapsed % 10 === 0) {
          const currentTime = Date.now();
          // Only announce if we haven't announced in the last 5 seconds (prevents duplicates)
          if (currentTime - lastAnnouncementTime >= 5000) {
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            
            let timeAnnouncement = '';
            if (minutes > 0) {
              timeAnnouncement = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
              if (seconds > 0) {
                timeAnnouncement += ` ${seconds} second${seconds !== 1 ? 's' : ''}`;
              }
            } else {
              timeAnnouncement = `${seconds} second${seconds !== 1 ? 's' : ''}`;
            }
            
            speak(`${timeAnnouncement} completed. Keep holding!`, 'medium');
            setLastAnnouncementTime(currentTime);
          }
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, hasStarted, lastAnnouncementTime, speak]);

  // Always run analysis to detect pose and connect WebSocket
  useEffect(() => {
    startAnalysis();
    
    // Connect WebSocket after a small delay to ensure component is ready
    const connectTimeout = setTimeout(() => {
      if (!isConnected) {
        console.log('Coaching page: Connecting to WebSocket...');
        connect();
      }
    }, 100);
    
    return () => {
      clearTimeout(connectTimeout);
      stopAnalysis();
      disconnect(); // Clean up WebSocket on unmount
    };
  }, []); // Empty dependency array - run once on mount

  // Voice recognition setup and management
  useEffect(() => {
    // Check if speech recognition is supported
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      console.log('✅ Speech recognition supported');
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true; // Enable interim results for better responsiveness
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 5; // Consider even more alternatives
      
      // Try to make it more sensitive
      if ('webkitSpeechGrammarList' in window) {
        const grammar = '#JSGF V1.0; grammar commands; public <command> = stop | end | finish | quit | done | pause;';
        const speechRecognitionList = new (window as any).webkitSpeechGrammarList();
        speechRecognitionList.addFromString(grammar, 1);
        recognition.grammars = speechRecognitionList;
      }
      
      recognitionRef.current = recognition;
      console.log('✅ Voice recognition initialized');
    } else {
      console.log('❌ Speech recognition not supported in this browser');
    }
  }, []);

  // Voice command handler for stop
  useEffect(() => {
    console.log('🎤 Voice effect triggered:', { hasStarted, isRunning, voiceEnabled, hasRecognition: !!recognitionRef.current });
    
    // Start voice recognition as soon as we have started (even before isRunning is true)
    if (recognitionRef.current && hasStarted && voiceEnabled) {
      console.log('🎤 Setting up voice recognition handlers...');
      const recognition = recognitionRef.current;
      
      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          
          // Process ALL results, regardless of confidence - be very aggressive
          const transcript = result[0].transcript.toLowerCase().trim();
          const confidence = result[0].confidence || 0;
          
          if (transcript.length > 0) {
            console.log('🎤 Voice heard:', transcript, 'confidence:', confidence, 'isFinal:', result.isFinal);
            
            // Check for stop command - simple and reliable
            if (transcript.includes('stop') || 
                transcript.includes('top') || 
                transcript.includes('end') || 
                transcript.includes('finish') ||
                transcript.includes('done') ||
                transcript === 'op' ||
                transcript === 'st') {
              console.log('🎤 STOP COMMAND DETECTED! Words:', transcript);
              
              // Stop recognition first to prevent conflicts
              try {
                recognition.stop();
                recognitionStartedRef.current = false;
              } catch (e) {
                console.log('🎤 Error stopping recognition:', e);
              }
              
              // Then handle the stop
              handleStop();
              break;
            }
          }
        }
      };
      
      recognition.onstart = () => {
        console.log('🎤 Voice recognition STARTED listening');
        setIsListening(true);
        recognitionStartedRef.current = true;
      };
      
      recognition.onend = () => {
        console.log('🎤 Voice recognition ENDED');
        setIsListening(false);
        recognitionStartedRef.current = false;
        // Restart if still in session
        if (hasStarted && voiceEnabled) {
          console.log('🎤 Will restart voice recognition in 500ms...');
          setTimeout(() => {
            if (hasStarted && voiceEnabled && recognitionRef.current && !recognitionStartedRef.current) {
              try {
                recognitionRef.current.start();
                console.log('🎤 Voice recognition restarted');
              } catch (error) {
                console.log('🎤 Restart failed:', error);
              }
            }
          }, 500);
        }
      };
      
      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          // Microphone permission denied - disable voice recognition completely
          console.log('🚫 Microphone permission denied - disabling voice commands');
          recognitionStartedRef.current = false;
          recognitionRef.current = null; // Clear the reference to prevent further attempts
        } else if (event.error === 'no-speech') {
          // Common, not an error - just continue
        } else if (event.error === 'aborted') {
          // Normal when stopping
          recognitionStartedRef.current = false;
        } else if (event.error !== 'network') { // Ignore network errors
          // Silently handle other errors
          recognitionStartedRef.current = false;
        }
        setIsListening(false);
      };
      
      // Only start if not already started
      if (!recognitionStartedRef.current) {
        try {
          recognition.start();
          console.log('🎤 Voice recognition start() called');
          recognitionStartedRef.current = true;
        } catch (error: any) {
          if (error?.message && error.message.includes('already started')) {
            console.log('🎤 Voice recognition already running');
            recognitionStartedRef.current = true;
          } else {
            // Failed to start - could be permissions or other error
            console.log('⚠️ Voice recognition not available - app will continue without voice commands');
            recognitionStartedRef.current = false;
            setIsListening(false);
            // Clear the recognition ref to prevent further attempts
            if (error?.message && error.message.includes('not-allowed')) {
              recognitionRef.current = null;
            }
          }
        }
      } else {
        console.log('🎤 Voice recognition already started, skipping');
      }
    } else if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
        }
      }
    };
  }, [hasStarted, isRunning, voiceEnabled]);

  // Voice feedback for critical issues
  useEffect(() => {
    if (!currentAnalysis || !voiceEnabled) return;

    const now = Date.now();
    const feedbackDelay = 5000; // 5 seconds between feedback messages

    if (now - lastFeedbackTime < feedbackDelay) return;

    const { feedback, overallScore } = currentAnalysis;
    
    if (feedback.length > 0 && overallScore < SCORE_THRESHOLDS.GOOD) {
      // Prioritize most critical feedback
      const criticalFeedback = feedback[0];
      speak(criticalFeedback, 'medium');
      setLastFeedbackTime(now);
    }
  }, [currentAnalysis, voiceEnabled, speak, lastFeedbackTime]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePauseResume = () => {
    setIsRunning(!isRunning);
    if (isRunning) {
      speak('Session paused', 'high');
    } else {
      speak('Session resumed', 'high');
      sessionStartTime.current = Date.now() - sessionTime * 1000;
    }
  };

  const handleStop = async () => {
    setIsRunning(false);
    stopAnalysis();
    speak('Session completed', 'high');
    
    // Calculate final scores from all analysis data
    const analysisData = analysisDataRef.current;
    
    if (analysisData.length > 0 && sessionId) {
      // Calculate averages from valid data points only
      const validBodyData = analysisData.filter(d => d.bodyAlignmentScore > 0);
      const validKneeData = analysisData.filter(d => d.kneePositionScore > 0);
      const validShoulderData = analysisData.filter(d => d.shoulderStackScore > 0);
      const validOverallData = analysisData.filter(d => d.overallScore > 0);
      
      const avgBodyAlignment = validBodyData.length > 0
        ? Math.round(validBodyData.reduce((sum, d) => sum + d.bodyAlignmentScore, 0) / validBodyData.length)
        : 0;
      
      const avgKneePosition = validKneeData.length > 0
        ? Math.round(validKneeData.reduce((sum, d) => sum + d.kneePositionScore, 0) / validKneeData.length)
        : 0;
      
      const avgShoulderStack = validShoulderData.length > 0
        ? Math.round(validShoulderData.reduce((sum, d) => sum + d.shoulderStackScore, 0) / validShoulderData.length)
        : 100; // Default to perfect if no issues detected
      
      const avgOverallScore = validOverallData.length > 0
        ? Math.round(validOverallData.reduce((sum, d) => sum + d.overallScore, 0) / validOverallData.length)
        : Math.round((avgBodyAlignment + avgKneePosition + avgShoulderStack) / 3);
      
      
      const plankType = analysisData[analysisData.length - 1]?.plankType || 'unknown';
      
      
      try {
        const endTime = new Date();
        const calculatedDuration = sessionStartTime.current 
          ? Math.floor((endTime.getTime() - sessionStartTime.current) / 1000)
          : sessionTime;
          
        const result = await updateSession.mutateAsync({
          endTime: endTime,
          duration: calculatedDuration,
          averageScore: avgOverallScore,
          bodyAlignmentScore: avgBodyAlignment,
          kneePositionScore: avgKneePosition,
          shoulderStackScore: avgShoulderStack,
          plankType,
          completed: true,
        });
      } catch (error) {
        console.error('Error updating session:', error);
      }
    }
    
    setLocation(`/results/${sessionId}`);
  };

  const getOverallScoreColor = (score: number): string => {
    if (score >= SCORE_THRESHOLDS.EXCELLENT) return 'text-success';
    if (score >= SCORE_THRESHOLDS.GOOD) return 'text-warning';
    return 'text-error';
  };

  const getScoreStatus = (score: number): string => {
    if (score >= SCORE_THRESHOLDS.EXCELLENT) return 'Excellent Form';
    if (score >= SCORE_THRESHOLDS.GOOD) return 'Good Form';
    return 'Needs Improvement';
  };

  const calculateStrokeDashoffset = (score: number): number => {
    const circumference = 2 * Math.PI * 40; // radius = 40
    return circumference - (score / 100) * circumference;
  };

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center text-white">
          <h2 className="text-xl font-semibold mb-2">Session Not Found</h2>
          <Button onClick={() => setLocation('/')} variant="outline">
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-dark-bg relative overflow-hidden">
      {/* Camera Feed */}
      <div className="absolute inset-0 bg-gray-900">
        <CameraFeed 
          onResults={processResults}
          className="w-full h-full"
        />
        {currentLandmarks.length > 0 && (
          <PoseOverlay 
            landmarks={currentLandmarks}
            videoElement={undefined}
            className=""
          />
        )}
      </div>

      {/* Top Status Bar */}
      <div className="absolute top-2 left-2 right-2 flex justify-between items-center z-20">
        <div className="flex items-center space-x-2">
          {/* Session Timer */}
          <Card className="bg-surface/80 backdrop-blur-sm px-3 py-1">
            <div className="flex items-center space-x-1">
              <Clock className="w-3 h-3 text-success" />
              <span className="font-medium text-sm text-white">
                {formatTime(sessionTime)}
              </span>
            </div>
          </Card>
          
          {/* Detection Status */}
          <Card className="bg-surface/80 backdrop-blur-sm px-3 py-1">
            <div className="text-white text-xs">
              <span className="font-semibold text-success">
                {!fullBodyDetected ? 'Detecting...' :
                 !plankTypeDetected ? 'Plank type...' :
                 !hasStarted ? 'Ready' :
                 detectedPlankType === 'high' ? 'High Plank' : 'Elbow Plank'}
              </span>
              {isListening && hasStarted && (
                <span className="ml-1 text-gray-300">(Say "stop")</span>
              )}
            </div>
          </Card>
        </div>

        {/* Voice Feedback Toggle */}
        <Button
          onClick={toggleVoice}
          variant="ghost"
          size="sm"
          className="bg-surface/80 backdrop-blur-sm hover:bg-surface-light/80 p-2"
        >
          {voiceEnabled ? (
            <Volume2 className="w-4 h-4 text-success" />
          ) : (
            <VolumeX className="w-4 h-4 text-gray-400" />
          )}
        </Button>
      </div>

      {/* Horizontal Metrics Bar - Top */}
      {currentAnalysis && (
        <div className="absolute top-16 left-2 right-2 z-20">
          <div className="flex justify-between space-x-2">
            <Card className="bg-surface/80 backdrop-blur-sm p-2 flex-1 text-center">
              <div className="text-xs text-gray-300">Body</div>
              <div className={`text-lg font-bold ${currentAnalysis.bodyAlignmentScore >= 70 ? 'text-success' : 'text-error'}`}>
                {currentAnalysis.bodyAlignmentScore}
              </div>
            </Card>
            <Card className="bg-surface/80 backdrop-blur-sm p-2 flex-1 text-center">
              <div className="text-xs text-gray-300">Knee</div>
              <div className={`text-lg font-bold ${currentAnalysis.kneePositionScore >= 70 ? 'text-success' : 'text-error'}`}>
                {currentAnalysis.kneePositionScore}
              </div>
            </Card>
            <Card className="bg-surface/80 backdrop-blur-sm p-2 flex-1 text-center">
              <div className="text-xs text-gray-300">Shoulder</div>
              <div className={`text-lg font-bold ${currentAnalysis.shoulderStackScore >= 70 ? 'text-success' : 'text-error'}`}>
                {currentAnalysis.shoulderStackScore}
              </div>
            </Card>
            <Card className="bg-surface/80 backdrop-blur-sm p-2 flex-1 text-center">
              <div className="text-xs text-gray-300">Overall</div>
              <div className={`text-lg font-bold ${getOverallScoreColor(currentAnalysis.overallScore)}`}>
                {currentAnalysis.overallScore}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Bottom - Feedback & Controls */}
      <div className="absolute bottom-2 left-2 right-2 z-20">
        {/* Live Feedback or Getting Ready Message */}
        {!hasStarted ? (
          <Card className="bg-blue-500/90 backdrop-blur-sm p-3 mb-3 text-center">
            <div className="text-white text-sm">
              {currentLandmarks.length === 0 ? 'Position yourself in camera view' :
               !fullBodyDetected ? 'Stand where your full body is visible' :
               !plankTypeDetected ? 'Get in plank position' :
               'Hold position - timer will start soon!'}
            </div>
          </Card>
        ) : currentAnalysis?.feedback && currentAnalysis.feedback.length > 0 && (
          <Card className="bg-warning/90 backdrop-blur-sm p-3 mb-3 text-center">
            <div className="text-black text-sm font-medium">
              {currentAnalysis.feedback[0]}
            </div>
          </Card>
        )}

        {/* Control Buttons */}
        <div className="flex justify-center space-x-4">
          <Button
            onClick={handlePauseResume}
            variant="ghost"
            size="sm"
            className="bg-surface/80 backdrop-blur-sm hover:bg-surface-light/80 px-4 py-2"
          >
            {isRunning ? (
              <>
                <Pause className="w-4 h-4 mr-1" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-1" />
                Resume
              </>
            )}
          </Button>

          <Button
            onClick={handleStop}
            size="sm"
            className="bg-error/80 backdrop-blur-sm hover:bg-error px-4 py-2"
          >
            <Square className="w-4 h-4 mr-1" />
            Stop
          </Button>
        </div>
      </div>
    </div>
  );
}
