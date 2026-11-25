import { ExternalLink, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'reviewPromptState';
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

interface ReviewPromptState {
  installedAt: number;
  dismissedAt?: number;
  reviewed?: boolean;
  neverAsk?: boolean;
}

const RATING_LABELS = ['', 'Needs work', 'Could be better', "It's good", 'Really like it!', 'Love it!'];

function getStoreReviewUrl(): string {
  const id = typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : '';
  return id
    ? `https://chromewebstore.google.com/detail/${id}/reviews`
    : 'https://chromewebstore.google.com/';
}

function isEligible(state: ReviewPromptState, now: number): boolean {
  if (state.reviewed || state.neverAsk) return false;
  if (now - state.installedAt < TEN_DAYS_MS) return false;
  if (state.dismissedAt && now - state.dismissedAt < SNOOZE_MS) return false;
  return true;
}

export function ReviewPrompt() {
  const [visible, setVisible] = useState(false);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedStar, setSelectedStar] = useState(0);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

    void chrome.storage.local.get(STORAGE_KEY).then((res) => {
      const now = Date.now();
      const existing = res[STORAGE_KEY] as ReviewPromptState | undefined;

      if (!existing?.installedAt) {
        void chrome.storage.local.set({ [STORAGE_KEY]: { installedAt: now } });
        return;
      }

      if (isEligible(existing, now)) {
        setVisible(true);
      }
    });
  }, []);

  if (!visible) return null;

  const updateState = (patch: Partial<ReviewPromptState>) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    void chrome.storage.local.get(STORAGE_KEY).then((res) => {
      const current = (res[STORAGE_KEY] as ReviewPromptState) || { installedAt: Date.now() };
      return chrome.storage.local.set({ [STORAGE_KEY]: { ...current, ...patch } });
    });
  };

  const handleReviewClick = (stars?: number) => {
    if (stars) setSelectedStar(stars);
    updateState({ reviewed: true });
    const url = getStoreReviewUrl();
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      void chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    setVisible(false);
  };

  const handleDismiss = () => {
    updateState({ dismissedAt: Date.now() });
    setVisible(false);
  };

  const handleNeverAsk = () => {
    updateState({ neverAsk: true });
    setVisible(false);
  };

  const activeStars = hoveredStar || selectedStar;

  return (
    <section className="p-review" role="region" aria-label="Rate FocusMask">
      <button
        type="button"
        className="icon-btn p-review-close"
        onClick={handleDismiss}
        aria-label="Remind me later"
        title="Remind me later"
      >
        <X size={14} />
      </button>

      <div className="p-review-head">
        <div className="p-review-title">Enjoying FocusMask?</div>
        <div className="p-review-sub">
          {activeStars > 0 ? RATING_LABELS[activeStars] : 'Tap a star to leave a quick review on Chrome Web Store.'}
        </div>
      </div>

      <div className="p-review-controls">
        <div className="p-review-stars" onMouseLeave={() => setHoveredStar(0)}>
          {[1, 2, 3, 4, 5].map((star) => {
            const filled = star <= activeStars;
            return (
              <button
                key={star}
                type="button"
                className={`p-review-star${filled ? ' is-filled' : ''}`}
                onMouseEnter={() => setHoveredStar(star)}
                onClick={() => handleReviewClick(star)}
                aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
              >
                <Star
                  size={17}
                  color={filled ? '#f5b301' : 'var(--muted)'}
                  fill={filled ? '#f5b301' : 'none'}
                />
              </button>
            );
          })}
        </div>

        <button type="button" className="p-review-cta" onClick={() => handleReviewClick()}>
          Review <ExternalLink size={11} />
        </button>
      </div>

      <div className="p-review-links">
        <button type="button" className="p-review-link" onClick={handleDismiss}>
          Maybe later
        </button>
        <button type="button" className="p-review-link" onClick={handleNeverAsk}>
          Don&apos;t ask again
        </button>
      </div>
    </section>
  );
}
