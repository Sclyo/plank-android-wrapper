import { POSE_LANDMARKS, SCORING_THRESHOLDS, CONFIDENCE_THRESHOLD, FEEDBACK_MESSAGES } from './constants';

export interface PoseAnalysisResult {
  bodyAlignmentAngle: number;
  kneeAngle: number;
  shoulderStackAngle: number;
  bodyAlignmentScore: number;
  kneePositionScore: number;
  shoulderStackScore: number;
  overallScore: number;
  feedback: string[];
  plankType: 'high' | 'elbow' | 'unknown';
}

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export function calculateAngle(point1: Landmark, point2: Landmark, point3: Landmark): number {
  const vector1 = {
    x: point1.x - point2.x,
    y: point1.y - point2.y,
  };
  
  const vector2 = {
    x: point3.x - point2.x,
    y: point3.y - point2.y,
  };
  
  const dotProduct = vector1.x * vector2.x + vector1.y * vector2.y;
  const magnitude1 = Math.sqrt(vector1.x ** 2 + vector1.y ** 2);
  const magnitude2 = Math.sqrt(vector2.x ** 2 + vector2.y ** 2);
  
  const cosAngle = dotProduct / (magnitude1 * magnitude2);
  const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
  
  return angleRad * (180 / Math.PI);
}

export function detectPlankType(landmarks: Landmark[]): 'high' | 'elbow' | 'unknown' {
  // Get better visible side for arm angle calculation
  const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const leftElbow = landmarks[POSE_LANDMARKS.LEFT_ELBOW];
  const rightElbow = landmarks[POSE_LANDMARKS.RIGHT_ELBOW];
  const leftWrist = landmarks[POSE_LANDMARKS.LEFT_WRIST];
  const rightWrist = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
  
  // Check visibility of each side
  const leftVisibility = (leftShoulder?.visibility || 0) + (leftElbow?.visibility || 0) + (leftWrist?.visibility || 0);
  const rightVisibility = (rightShoulder?.visibility || 0) + (rightElbow?.visibility || 0) + (rightWrist?.visibility || 0);
  
  // Use the side with better visibility
  const useLeftSide = leftVisibility > rightVisibility;
  const shoulder = useLeftSide ? leftShoulder : rightShoulder;
  const elbow = useLeftSide ? leftElbow : rightElbow;
  const wrist = useLeftSide ? leftWrist : rightWrist;
  
  // Need all three points visible for accurate detection
  if (!shoulder || !elbow || !wrist || 
      (shoulder.visibility || 0) < CONFIDENCE_THRESHOLD || 
      (elbow.visibility || 0) < CONFIDENCE_THRESHOLD || 
      (wrist.visibility || 0) < CONFIDENCE_THRESHOLD) {
    return 'unknown';
  }
  
  // Calculate shoulder-elbow-wrist angle (angle at the elbow vertex)
  const shoulderElbowWristAngle = calculateAngle(shoulder, elbow, wrist);
  
  // HIGH PLANK: shoulder-elbow-wrist should be ~180° (± 10°)
  if (shoulderElbowWristAngle >= 170 && shoulderElbowWristAngle <= 190) {
    return 'high';
  }
  
  // ELBOW PLANK: shoulder-elbow-wrist should be ~90° (± 15°)
  if (shoulderElbowWristAngle >= 75 && shoulderElbowWristAngle <= 105) {
    return 'elbow';
  }
  
  return 'unknown';
}

export function analyzePose(landmarks: Landmark[]): PoseAnalysisResult {
  const feedback: string[] = [];
  
  // Detect plank type
  const plankType = detectPlankType(landmarks);
  
  // Get better visible side
  const leftSide = [
    landmarks[POSE_LANDMARKS.LEFT_SHOULDER],
    landmarks[POSE_LANDMARKS.LEFT_HIP],
    landmarks[POSE_LANDMARKS.LEFT_KNEE],
    landmarks[POSE_LANDMARKS.LEFT_ANKLE]
  ];
  
  const rightSide = [
    landmarks[POSE_LANDMARKS.RIGHT_SHOULDER],
    landmarks[POSE_LANDMARKS.RIGHT_HIP],
    landmarks[POSE_LANDMARKS.RIGHT_KNEE],
    landmarks[POSE_LANDMARKS.RIGHT_ANKLE]
  ];
  
  const leftVisibility = leftSide.reduce((sum, landmark) => sum + (landmark?.visibility || 0), 0) / 4;
  const rightVisibility = rightSide.reduce((sum, landmark) => sum + (landmark?.visibility || 0), 0) / 4;
  
  const useBetterSide = leftVisibility > rightVisibility;
  
  const shoulder = useBetterSide ? landmarks[POSE_LANDMARKS.LEFT_SHOULDER] : landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const hip = useBetterSide ? landmarks[POSE_LANDMARKS.LEFT_HIP] : landmarks[POSE_LANDMARKS.RIGHT_HIP];
  const knee = useBetterSide ? landmarks[POSE_LANDMARKS.LEFT_KNEE] : landmarks[POSE_LANDMARKS.RIGHT_KNEE];
  const ankle = useBetterSide ? landmarks[POSE_LANDMARKS.LEFT_ANKLE] : landmarks[POSE_LANDMARKS.RIGHT_ANKLE];
  const elbow = useBetterSide ? landmarks[POSE_LANDMARKS.LEFT_ELBOW] : landmarks[POSE_LANDMARKS.RIGHT_ELBOW];
  const wrist = useBetterSide ? landmarks[POSE_LANDMARKS.LEFT_WRIST] : landmarks[POSE_LANDMARKS.RIGHT_WRIST];

  // Body Alignment Analysis
  let bodyAlignmentAngle = 0;
  let bodyAlignmentScore = 50; // Default fallback score
  
  if (shoulder?.visibility && hip?.visibility && ankle?.visibility &&
      shoulder.visibility >= CONFIDENCE_THRESHOLD && 
      hip.visibility >= CONFIDENCE_THRESHOLD && 
      ankle.visibility >= CONFIDENCE_THRESHOLD) {
    
    bodyAlignmentAngle = calculateAngle(shoulder, hip, ankle);
    const deviation = Math.abs(bodyAlignmentAngle - SCORING_THRESHOLDS.BODY_ALIGNMENT.TARGET);
    
    if (deviation <= SCORING_THRESHOLDS.BODY_ALIGNMENT.TOLERANCE) {
      bodyAlignmentScore = 100;
    } else {
      bodyAlignmentScore = Math.max(0, 100 - (deviation - SCORING_THRESHOLDS.BODY_ALIGNMENT.TOLERANCE) * SCORING_THRESHOLDS.BODY_ALIGNMENT.PENALTY_PER_DEGREE);
    }
    
    if (bodyAlignmentAngle < 170) {
      feedback.push(FEEDBACK_MESSAGES.BODY_ALIGNMENT.LOW_ANGLE);
    } else if (bodyAlignmentAngle > 190) {
      feedback.push(FEEDBACK_MESSAGES.BODY_ALIGNMENT.HIGH_ANGLE);
    }
  } else {
    // When visibility is low, use fallback score instead of 0
    feedback.push(FEEDBACK_MESSAGES.BODY_ALIGNMENT.LOW_VISIBILITY);
  }

  // Knee Position Analysis
  let kneeAngle = 0;
  let kneePositionScore = 50; // Default fallback score
  
  if (hip?.visibility && knee?.visibility && ankle?.visibility &&
      hip.visibility >= CONFIDENCE_THRESHOLD && 
      knee.visibility >= CONFIDENCE_THRESHOLD && 
      ankle.visibility >= CONFIDENCE_THRESHOLD) {
    
    kneeAngle = calculateAngle(hip, knee, ankle);
    
    if (kneeAngle >= SCORING_THRESHOLDS.KNEE_POSITION.TARGET) {
      kneePositionScore = 100;
    } else {
      const deficit = SCORING_THRESHOLDS.KNEE_POSITION.TARGET - kneeAngle;
      kneePositionScore = Math.max(0, 100 - deficit * SCORING_THRESHOLDS.KNEE_POSITION.PENALTY_PER_DEGREE);
    }
    
    if (kneeAngle < SCORING_THRESHOLDS.KNEE_POSITION.TARGET) {
      feedback.push(FEEDBACK_MESSAGES.KNEE_POSITION.BENT_LEGS);
    }
  } else {
    // When visibility is low, use fallback score instead of 0
    feedback.push(FEEDBACK_MESSAGES.KNEE_POSITION.LOW_VISIBILITY);
  }

  // Shoulder Stack Analysis
  let shoulderStackAngle = 0;
  let shoulderStackScore = 50; // Default fallback score
  
  const targetJoint = plankType === 'high' ? wrist : elbow;
  
  if (shoulder?.visibility && targetJoint?.visibility &&
      shoulder.visibility >= CONFIDENCE_THRESHOLD && 
      targetJoint.visibility >= CONFIDENCE_THRESHOLD) {
    
    // Calculate horizontal offset
    const horizontalOffset = Math.abs(shoulder.x - targetJoint.x);
    shoulderStackAngle = Math.atan2(Math.abs(shoulder.y - targetJoint.y), horizontalOffset) * (180 / Math.PI);
    
    if (horizontalOffset < SCORING_THRESHOLDS.SHOULDER_STACK.EXCELLENT) {
      shoulderStackScore = 100;
    } else if (horizontalOffset < SCORING_THRESHOLDS.SHOULDER_STACK.GOOD) {
      shoulderStackScore = 80;
    } else {
      shoulderStackScore = 60;
    }
    
    const angleDeviation = Math.abs(shoulderStackAngle - SCORING_THRESHOLDS.SHOULDER_STACK.TARGET);
    if (angleDeviation > SCORING_THRESHOLDS.SHOULDER_STACK.TOLERANCE) {
      if (plankType === 'high') {
        feedback.push(FEEDBACK_MESSAGES.SHOULDER_STACK.HIGH_PLANK);
      } else {
        feedback.push(FEEDBACK_MESSAGES.SHOULDER_STACK.LOW_PLANK);
      }
    }
  }
  // Fallback score already set as default

  // Calculate overall score
  const overallScore = Math.round((bodyAlignmentScore + kneePositionScore + shoulderStackScore) / 3);

  return {
    bodyAlignmentAngle,
    kneeAngle,
    shoulderStackAngle,
    bodyAlignmentScore: Math.round(bodyAlignmentScore),
    kneePositionScore: Math.round(kneePositionScore),
    shoulderStackScore: Math.round(shoulderStackScore),
    overallScore,
    feedback,
    plankType,
  };
}
