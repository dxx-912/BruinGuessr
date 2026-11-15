/** Tunable settings for the photo pipeline. Change a number here, re-run the scripts. */
export const PIPELINE = {
  /** Photos up to this far outside the campus boundary are considered (SPEC.md, Phase 1). */
  bufferM: 40,

  mapillary: {
    /** Mapillary's own 0..1 quality score. Below this, photos are mostly blurred or badly exposed. */
    minQuality: 0.5,
    /**
     * Two photos are near duplicates when they are this close AND face within
     * `dupHeadingDeg` of each other. Only the better one is kept.
     */
    dupRadiusM: 22,
    dupHeadingDeg: 40,
    /**
     * A buffer photo must have campus in frame: campus ground within this distance,
     * along the compass heading or up to `bufferHalfFovDeg` either side of it
     * (a phone camera sees roughly 30 degrees each way).
     */
    bufferLookAheadM: 70,
    bufferHalfFovDeg: 30,
  },

  wikimedia: {
    /** Smaller originals look soft at full screen. */
    minLongEdgePx: 1200,
    /** Skips stitched panoramas and tall slivers. */
    minAspect: 0.6,
    maxAspect: 2.1,
    /** Campus has changed too much before this. */
    minYear: 2008,
    /** At most this many photos from the same ~12 m spot. */
    maxPerSpot: 2,
    spotRadiusM: 12,
  },

  /** Variance of the Laplacian below this is treated as blurry. */
  minSharpness: 40,

  /** The file players actually receive. */
  output: {
    maxEdgePx: 1600,
    webpQuality: 80,
    thumbEdgePx: 480,
  },
} as const;

export const STORAGE_BUCKET = "photos";
