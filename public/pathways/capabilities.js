/** What this build can actually run. None of these call a model provider. */

export const MODEL_TASKS = [
  {
    id: "language",
    configured: false,
    labelKey: "model_language",
    detailKey: "model_language_detail",
  },
  {
    id: "vision",
    configured: false,
    labelKey: "model_vision",
    detailKey: "model_vision_detail",
  },
  {
    id: "speech",
    configured: false,
    labelKey: "model_speech",
    detailKey: "model_speech_detail",
  },
  {
    id: "video",
    configured: false,
    labelKey: "model_video",
    detailKey: "model_video_detail",
  },
];

const SPATIAL_TOPICS = new Set(["molecule", "geometric-solid"]);

export function spatialViewFor(pathwayId) {
  if (!SPATIAL_TOPICS.has(pathwayId)) return null;
  return { mode: "optional-3d", fallback: "2d", reducedMotion: "2d" };
}
