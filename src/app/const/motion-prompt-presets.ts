/** T2M 検証用のモーションプロンプトプリセット（HumanML3D 形式の英語） */
export type MotionPromptPreset = {
  id: string;
  label: string;
  prompt: string;
};

export type FloodStreamingPreset = {
  id: string;
  label: string;
  segments: { text: string; endToken: number }[];
};

export const MOTION_PROMPT_PRESETS: MotionPromptPreset[] = [
  {
    id: "walk-happy",
    label: "嬉しそうに前に歩く",
    prompt: "a person walks forward happily",
  },
  {
    id: "walk-slow",
    label: "ゆっくり歩く",
    prompt: "a person walks slowly",
  },
  {
    id: "run",
    label: "走る",
    prompt: "a person runs",
  },
  {
    id: "jump",
    label: "ジャンプする",
    prompt: "a person jumps up",
  },
  {
    id: "wave",
    label: "手を振る",
    prompt: "a person waves with their right hand",
  },
  {
    id: "sit",
    label: "座る",
    prompt: "a person sits down",
  },
  {
    id: "dance",
    label: "踊る",
    prompt: "a person dances gracefully",
  },
  {
    id: "kick",
    label: "左足でキック",
    prompt: "a person kicks with their left leg",
  },
  {
    id: "turn",
    label: "振り向く",
    prompt: "a person turns around",
  },
  {
    id: "bow",
    label: "お辞儀する",
    prompt: "a person bows politely",
  },
  {
    id: "pick-up",
    label: "物を拾う",
    prompt: "a person picks something up from the ground",
  },
  {
    id: "stretch",
    label: "ストレッチする",
    prompt: "a person stretches their arms above their head",
  },
];

export const FLOOD_STREAMING_PRESETS: FloodStreamingPreset[] = [
  {
    id: "walk-turn-run",
    label: "歩く→振返る→走る",
    segments: [
      { text: "a person walks forward", endToken: 20 },
      { text: "a person turns around", endToken: 40 },
      { text: "a person runs", endToken: 60 },
    ],
  },
  {
    id: "wave-sit-stand",
    label: "手を振る→座る→立つ",
    segments: [
      { text: "a person waves with their right hand", endToken: 15 },
      { text: "a person sits down", endToken: 35 },
      { text: "a person stands up", endToken: 50 },
    ],
  },
  {
    id: "walk-bow",
    label: "歩く→お辞儀",
    segments: [
      { text: "a person walks forward slowly", endToken: 30 },
      { text: "a person bows politely", endToken: 45 },
    ],
  },
];

export const CUSTOM_PRESET_ID = "custom";
export const CUSTOM_FLOOD_STREAMING_ID = "custom-streaming";
