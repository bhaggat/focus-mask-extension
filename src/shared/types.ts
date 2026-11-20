export type PauseReason = 'manual' | 'auto-tab' | 'away' | 'break';

export interface Settings {
  soundId: string;
  /** 0..1 */
  volume: number;
  autoPause: boolean;
  /** Pause while the OS screen is locked; resume on unlock. */
  pauseOnLock: boolean;
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
  /** Mirrors Settings.pauseOnLock. */
  lockPause: boolean;
  screenLocked: boolean;
  breakActive: boolean;
  breakEndsAt: number | null;
  nextBreakAt: number | null;
  /** Sleep timer: when it fires playback is paused (manual, sticky). */
  sleepEndsAt: number | null;
  /** Duration the running sleep timer was started with, for the UI. */
  sleepMin: number | null;
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
  | { type: 'sleepTimer'; minutes: number | null }
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
