export type PauseReason = 'manual' | 'auto-tab' | 'break';

export interface Settings {
  soundId: string;
  /** 0..1 */
  volume: number;
  autoPause: boolean;
  breakEnabled: boolean;
  breakIntervalMin: number;
  breakLengthMin: number;
  onboarded: boolean;
}

/** Runtime state owned by the service worker, mirrored to chrome.storage.session. */
export interface RuntimeState {
  soundId: string;
  /** User pressed pause (or never pressed play this session). Sticky. */
  manual: boolean;
  /** Another (unmuted) tab is currently audible, post-debounce. */
  tabAudible: boolean;
  /** User pressed play while a tab was audible — ignore it until tabs go quiet. */
  tabOverride: boolean;
  autoPause: boolean;
  breakActive: boolean;
  breakEndsAt: number | null;
  nextBreakAt: number | null;
  /** Last playback error shown to the user (e.g. a deleted custom sound). */
  error: string | null;
}

export interface CustomSoundMeta {
  id: string;
  name: string;
  type: string;
  size: number;
  duration: number;
  createdAt: number;
}

export interface CustomSoundRecord extends CustomSoundMeta {
  blob: Blob;
}

/** UI → background */
export type BgMessage =
  | { type: 'toggle' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'select'; soundId: string; play?: boolean }
  | { type: 'volume'; volume: number; persist?: boolean }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'endBreak' }
  | { type: 'customDeleted'; soundId: string }
  | { type: 'audioStatus' }
  | { type: 'getState' };

/** background → offscreen */
export type OffscreenMessage =
  | { target: 'offscreen'; type: 'play'; soundId: string; volume: number }
  | { target: 'offscreen'; type: 'pause' }
  | { target: 'offscreen'; type: 'volume'; volume: number }
  | { target: 'offscreen'; type: 'status' };

export interface OffscreenStatus {
  soundId: string | null;
  playing: boolean;
  contextState: string;
  rms: number;
  error: string | null;
}
