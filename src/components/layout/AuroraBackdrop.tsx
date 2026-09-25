"use client";

/**
 * Ambient background. Cost is theme-driven: the whole field is `opacity: 0`
 * for Pure OLED and Zen Paper (see `--aurora-opacity`), so those themes stay
 * perfectly flat while Aurora Glass gets its moving gradients and Cyberpunk
 * gets a faint neon grid.
 */
export function AuroraBackdrop() {
  return (
    <div className="aurora-field" aria-hidden="true">
      <div className="aurora-blob aurora-blob--a" />
      <div className="aurora-blob aurora-blob--b" />
      <div className="aurora-blob aurora-blob--c" />
      <div className="aurora-grid" />
      <div className="aurora-grain" />
    </div>
  );
}
