export interface BotTuning {
  cruiseFactor: number;
  arrivalRadius: number;
  shootSpeed: number;
  aimLift: number;
  shotInterval: number;
  avoidanceRadius: number;
  parkLead: number;
  outerStation: number;
  tractionCompensation: number;
}

// Calibrated against fixed-step Rapier rollouts; not measured robot hardware values.
export const BOT_POLICY: BotTuning = {
  cruiseFactor: 0.95,
  arrivalRadius: 0.12,
  shootSpeed: 0.1,
  aimLift: 0.08,
  shotInterval: 0.55,
  avoidanceRadius: 0.48,
  parkLead: 2.8,
  outerStation: 1.47,
  tractionCompensation: 0.6,
};
