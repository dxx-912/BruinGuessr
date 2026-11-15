/**
 * Types for the local photo pipeline (Phase 1).
 *
 * Everything the pipeline writes lives under .cache/pipeline/, which is gitignored:
 * these files tie photos to locations and source IDs, i.e. the answers to the game.
 */

export type Source = "mapillary" | "wikimedia" | "original";
export type Zone = "inside" | "buffer" | "outside";
export type Status = "approved" | "pending" | "rejected";

/** One photo that passed the automatic filters for its source. */
export type Candidate = {
  /** `${source}:${sourceId}`. Stable across runs. */
  key: string;
  source: Source;
  sourceId: string;
  /** Null only for an imported phone photo that carried no GPS. */
  lat: number | null;
  lng: number | null;
  /** Degrees clockwise from north, if known. */
  heading: number | null;
  capturedAt: string | null;
  photographer: string;
  photographerUrl: string | null;
  license: string;
  licenseUrl: string | null;
  /** Page for the original photo. Reveals the location, so server only until the reveal. */
  sourceUrl: string | null;
  /** Processed files, relative to .cache/pipeline/. */
  file: string;
  thumb: string;
  width: number;
  height: number;
  /** Variance of the Laplacian on a 512 px greyscale copy. Low means blurry. */
  sharpness: number;
  /** Mapillary only. */
  quality: number | null;
  onFoot: boolean | null;
  /** Status before any human decision. */
  defaultStatus: Status;
  /** Automatic remarks worth a look, e.g. "possible duplicate". */
  notes: string[];
};

/** A human (or reviewing-Claude) decision layered on top of a candidate. */
export type Decision = {
  status?: Status;
  /** Why it was rejected, or any other remark. */
  reason?: string;
  /** Corrected location (pin dragged on the review page). */
  lat?: number;
  lng?: number;
  decidedAt?: string;
};

/** What has been uploaded to Supabase for a candidate. */
export type Published = {
  imageId: string;
  storagePath: string;
  lat: number;
  lng: number;
  hidden: boolean;
};

/** A candidate with decisions and publish state applied. This is what the review page shows. */
export type CatalogEntry = Candidate & {
  status: Status;
  reason: string | null;
  /** True when the location was corrected by hand. */
  moved: boolean;
  /** Where the photo's own GPS (or its source) put it, before any correction. */
  origin: { lat: number; lng: number } | null;
  zone: Zone | null;
  published: Published | null;
  /** Live in the game, but the local location or status has changed since. */
  needsSync: boolean;
};
