/**
 * ランニングサイクル 4 フェーズ — 全サイクル（2歩）定義
 * contact (0%): 右足着地 / down (25%): 右足支持+左足振り上げ
 * pass (50%): 左足着地 / up (75%): 左足支持+右足振り上げ
 */
export const RUN_CYCLE_PHASES = ["contact", "down", "pass", "up"] as const;
export type RunCyclePhase = (typeof RUN_CYCLE_PHASES)[number];

/** CSS animation タイムライン上の位置 (0..1) */
export const RUN_CYCLE_PHASE_SEEK: Record<RunCyclePhase, number> = {
  contact: 0,
  down: 0.25,
  pass: 0.5,
  up: 0.75,
};

export type PhaseMeasurements = {
  rightLegAheadPx: number | null;
  leftLegAheadPx: number | null;
  leftLegBackPx: number | null;
  rightLegBackPx: number | null;
  leftArmAheadPx: number | null;
  rightArmAheadPx: number | null;
  leftArmBackPx: number | null;
  rightArmBackPx: number | null;
  strideSpreadPx: number | null;
  armCounterSwingPx: number | null;
  rightLegLiftPx: number | null;
  bodyLeanRightPx: number | null;
  headCenterY: number | null;
  bodyCenterY: number | null;
  figureBobCenterY: number | null;
  figureBobTranslateY: number | null;
  rightArmCenterX: number | null;
  leftArmCenterX: number | null;
  rightHandCenterX: number | null;
  leftHandCenterX: number | null;
};

export type PhaseChecks = {
  contralateral: boolean;
  bodyLeansRight: boolean;
  leadLegForward: boolean;
  leadArmForward: boolean;
  phaseRulesOk: boolean;
};

export function buildPhaseMeasurements(parts: Record<string, { centerX: number; centerY: number } | null>): PhaseMeasurements {
  const body = parts["motion-part-human-body"];
  const head = parts["motion-part-human-head"];
  const figureBob = parts["motion-figure-bob"];
  const leftLeg = parts["motion-part-human-leftLeg"];
  const rightLeg = parts["motion-part-human-rightLeg"];
  const leftArm = parts["motion-part-human-leftArm"];
  const rightArm = parts["motion-part-human-rightArm"];
  const leftHand = parts["motion-hand-left"];
  const rightHand = parts["motion-hand-right"];
  const round = (v: number) => Number(v.toFixed(2));

  const ahead = (part: { centerX: number } | null | undefined) =>
    part && body ? round(part.centerX - body.centerX) : null;
  const back = (part: { centerX: number } | null | undefined) =>
    part && body ? round(body.centerX - part.centerX) : null;

  return {
    rightLegAheadPx: ahead(rightLeg),
    leftLegAheadPx: ahead(leftLeg),
    leftLegBackPx: back(leftLeg),
    rightLegBackPx: back(rightLeg),
    leftArmAheadPx: ahead(leftArm),
    rightArmAheadPx: ahead(rightArm),
    leftArmBackPx: back(leftArm),
    rightArmBackPx: back(rightArm),
    strideSpreadPx:
      rightLeg && leftLeg ? round(rightLeg.centerX - leftLeg.centerX) : null,
    armCounterSwingPx:
      leftArm && rightArm ? round(leftArm.centerX - rightArm.centerX) : null,
    rightLegLiftPx:
      rightLeg && leftLeg ? round(leftLeg.centerY - rightLeg.centerY) : null,
    bodyLeanRightPx:
      head && body ? round(head.centerX - body.centerX) : null,
    headCenterY: head ? round(head.centerY) : null,
    bodyCenterY: body ? round(body.centerY) : null,
    figureBobCenterY: figureBob ? round(figureBob.centerY) : null,
    figureBobTranslateY: null,
    rightArmCenterX: rightArm ? round(rightArm.centerX) : null,
    leftArmCenterX: leftArm ? round(leftArm.centerX) : null,
    rightHandCenterX: rightHand ? round(rightHand.centerX) : null,
    leftHandCenterX: leftHand ? round(leftHand.centerX) : null,
  };
}

/** フェーズごとの骨格ルール（全サイクル定義） */
export function evaluatePhaseRules(
  phase: RunCyclePhase,
  m: PhaseMeasurements,
): PhaseChecks {
  const bodyLeansRight =
    m.bodyLeanRightPx != null && m.bodyLeanRightPx > 8;

  if (phase === "contact") {
    // 右足着地 + 左腕前 (contralateral)
    const contralateral =
      (m.rightLegAheadPx ?? 0) > 8 &&
      (m.leftArmAheadPx ?? 0) > 6 &&
      (m.leftLegBackPx ?? 0) > 8 &&
      (m.rightArmBackPx ?? 0) > 6;
    return {
      contralateral,
      bodyLeansRight,
      leadLegForward: (m.rightLegAheadPx ?? 0) > 8,
      leadArmForward: (m.leftArmAheadPx ?? 0) > 6,
      phaseRulesOk: contralateral && bodyLeansRight,
    };
  }

  if (phase === "down") {
    // 右足支持: ストイック版では足裏が重心下に近づくことを重視する
    const rightLegSupport =
      Math.abs(m.rightLegAheadPx ?? Number.POSITIVE_INFINITY) < 18;
    const strideMaintained = (m.strideSpreadPx ?? 0) > 20;
    const bodyAtLowest = (m.figureBobTranslateY ?? 0) >= 3;
    return {
      contralateral: rightLegSupport && strideMaintained,
      bodyLeansRight,
      leadLegForward: rightLegSupport,
      leadArmForward: strideMaintained,
      phaseRulesOk:
        bodyLeansRight && rightLegSupport && strideMaintained && bodyAtLowest,
    };
  }

  if (phase === "pass") {
    // 左足着地: 左脚が右脚より前 (strideSpread 負) + 右腕が左腕より前
    const leftLegLead =
      m.strideSpreadPx != null && m.strideSpreadPx < -12;
    const rightArmLead =
      m.rightHandCenterX != null &&
      m.leftHandCenterX != null &&
      m.rightHandCenterX > m.leftHandCenterX - 24;
    const rightLegBack = (m.rightLegBackPx ?? 0) > 8;
    const contralateral =
      leftLegLead && rightArmLead && rightLegBack;
    return {
      contralateral,
      bodyLeansRight,
      leadLegForward: leftLegLead,
      leadArmForward: rightArmLead,
      phaseRulesOk: contralateral && bodyLeansRight,
    };
  }

  // up: 左足支持 + 右足リカバリー（側面視では右足の bbox が拾いにくいため strideSpread で判定）
  const leftLegSupport = (m.leftLegBackPx ?? 0) > 20;
  const rightLegRecovering = (m.strideSpreadPx ?? 0) > 10;
  const bodyAtLowest = (m.figureBobTranslateY ?? 0) >= 3;
  return {
    contralateral: leftLegSupport && rightLegRecovering,
    bodyLeansRight,
    leadLegForward: leftLegSupport,
    leadArmForward: rightLegRecovering,
    phaseRulesOk:
      bodyLeansRight && leftLegSupport && rightLegRecovering && bodyAtLowest,
  };
}

export type CrossPhaseChecks = {
  bobHighestAtLanding: boolean;
  bobLowestAtSupport: boolean;
  headBobAmplitudeOk: boolean;
  armAlternates: boolean;
  rightArmMoves: boolean;
  strideMirrors: boolean;
  allPhasesOk: boolean;
};

export function evaluateCrossPhaseRules(
  byPhase: Record<RunCyclePhase, PhaseMeasurements>,
  byPhaseChecks: Record<RunCyclePhase, PhaseChecks>,
): CrossPhaseChecks {
  const bobByPhase = RUN_CYCLE_PHASES.map((p) => ({
    phase: p,
    y: byPhase[p].figureBobTranslateY ?? byPhase[p].figureBobCenterY,
  })).filter((entry): entry is { phase: RunCyclePhase; y: number } => entry.y != null);

  const landingBob = Math.min(
    byPhase.contact.figureBobTranslateY ?? byPhase.contact.figureBobCenterY ?? Infinity,
    byPhase.pass.figureBobTranslateY ?? byPhase.pass.figureBobCenterY ?? Infinity,
  );
  const supportBob = Math.max(
    byPhase.down.figureBobTranslateY ?? byPhase.down.figureBobCenterY ?? -Infinity,
    byPhase.up.figureBobTranslateY ?? byPhase.up.figureBobCenterY ?? -Infinity,
  );

  const bobHighestAtLanding =
    bobByPhase.length === RUN_CYCLE_PHASES.length &&
    landingBob <= supportBob - 2;

  const bobLowestAtSupport =
    bobByPhase.length === RUN_CYCLE_PHASES.length &&
    supportBob >= landingBob + 2;

  const bobValues = bobByPhase.map((entry) => entry.y);
  const bobAmp =
    bobValues.length > 0 ? Math.max(...bobValues) - Math.min(...bobValues) : 0;
  const headBobAmplitudeOk =
    bobByPhase.length === RUN_CYCLE_PHASES.length &&
    bobAmp >= 3 &&
    bobAmp <= 14;

  // Contact: 左腕前 / Pass: 右腕前
  const armAlternates =
    (byPhase.contact.leftArmAheadPx ?? 0) > (byPhase.contact.rightArmAheadPx ?? -999) &&
    (byPhase.pass.rightHandCenterX ?? 0) > (byPhase.pass.leftHandCenterX ?? -999) - 24;

  const rightArmContact = byPhase.contact.rightHandCenterX ?? byPhase.contact.rightArmCenterX;
  const rightArmPass = byPhase.pass.rightHandCenterX ?? byPhase.pass.rightArmCenterX;
  const rightArmMoves =
    rightArmContact != null &&
    rightArmPass != null &&
    Math.abs(rightArmPass - rightArmContact) > 15;

  // contact で右足前 (strideSpread > 0)、pass で左足前 (strideSpread < 0)
  const contactStride = byPhase.contact.strideSpreadPx ?? 0;
  const passStride = byPhase.pass.strideSpreadPx ?? 0;
  const strideMirrors =
    contactStride > 10 && passStride < -10;

  const allPhasesOk = RUN_CYCLE_PHASES.every((p) => byPhaseChecks[p].phaseRulesOk);

  return {
    bobHighestAtLanding,
    bobLowestAtSupport,
    headBobAmplitudeOk,
    armAlternates,
    rightArmMoves,
    strideMirrors,
    allPhasesOk,
  };
}
