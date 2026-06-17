import type { CdtCategory } from "@/app/const/edge-cdt-animation";
import type { DirectionHint } from "@/app/const/motion-intent";

export type MotionLabScenarioId =
  | "run-right"
  | "run-left"
  | "fight-impact"
  | "fight-defend"
  | "dance-rhythm"
  | "wave-greet";

export type MotionLabScenario = {
  id: MotionLabScenarioId;
  predicate: string;
  sourceName: string;
  sourceLabel: string;
  targetName: string;
  targetLabel: string;
  directionHint: DirectionHint;
  expectedCategory: CdtCategory;
  expectedStyle?: string;
};

export const MOTION_LAB_SCENARIOS: MotionLabScenario[] = [
  {
    id: "run-right",
    predicate: "PARTICIPATED_IN",
    sourceName: "作家A",
    sourceLabel: "Person",
    targetName: "イベントB",
    targetLabel: "Event",
    directionHint: "right",
    expectedCategory: "MOVE",
    expectedStyle: "run",
  },
  {
    id: "run-left",
    predicate: "VISITED",
    sourceName: "作家A",
    sourceLabel: "Person",
    targetName: "美術館",
    targetLabel: "Place",
    directionHint: "left",
    expectedCategory: "PTRANS",
    expectedStyle: "run",
  },
  {
    id: "fight-impact",
    predicate: "ATTACKED",
    sourceName: "武士A",
    sourceLabel: "Person",
    targetName: "武士B",
    targetLabel: "Person",
    directionHint: "right",
    expectedCategory: "PROPEL",
    expectedStyle: "fight",
  },
  {
    id: "fight-defend",
    predicate: "FOUGHT",
    sourceName: "武士B",
    sourceLabel: "Person",
    targetName: "武士A",
    targetLabel: "Person",
    directionHint: "left",
    expectedCategory: "PROPEL",
    expectedStyle: "fight",
  },
  {
    id: "dance-rhythm",
    predicate: "DANCED_WITH",
    sourceName: "舞者A",
    sourceLabel: "Person",
    targetName: "舞者B",
    targetLabel: "Person",
    directionHint: "auto",
    expectedCategory: "MOVE",
    expectedStyle: "dance",
  },
  {
    id: "wave-greet",
    predicate: "WAVED_TO",
    sourceName: "作家A",
    sourceLabel: "Person",
    targetName: "観客",
    targetLabel: "Person",
    directionHint: "right",
    expectedCategory: "MOVE",
    expectedStyle: "wave",
  },
];
