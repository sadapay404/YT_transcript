/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Pre-paint theme boot script
 * ─────────────────────────────────────────────────────────────────────────────
 *  Runs synchronously in <head> *before* first paint, so a returning visitor
 *  with a saved Zen Paper theme never sees a black flash. It is generated from
 *  the same constants the store uses, so the two can never drift apart.
 */
import { DEFAULT_SETTINGS, FONT_OPTIONS, STORAGE_KEYS, THEMES } from "./constants";

const FONT_STACKS: Record<string, string> = Object.fromEntries(
  FONT_OPTIONS.map((font) => [font.id, font.stack]),
);

const SCHEMES: Record<string, string> = Object.fromEntries(
  THEMES.map((theme) => [theme.id, theme.scheme]),
);

export const THEME_BOOT_SCRIPT = `(function(){try{
var KEY=${JSON.stringify(STORAGE_KEYS.settings)};
var STACKS=${JSON.stringify(FONT_STACKS)};
var SCHEMES=${JSON.stringify(SCHEMES)};
var DEFAULTS=${JSON.stringify({
  theme: DEFAULT_SETTINGS.theme,
  typography: DEFAULT_SETTINGS.typography,
  reduceMotion: DEFAULT_SETTINGS.reduceMotion,
})};
var raw=null;try{raw=localStorage.getItem(KEY)}catch(e){}
var saved={};
if(raw){try{saved=(JSON.parse(raw)||{}).state||{}}catch(e){}}
var theme=saved.theme||DEFAULTS.theme;
if(!SCHEMES[theme])theme=DEFAULTS.theme;
var t=Object.assign({},DEFAULTS.typography,saved.typography||{});
var r=document.documentElement;
r.dataset.theme=theme;
r.dataset.scheme=SCHEMES[theme]||'dark';
r.dataset.motion=saved.reduceMotion?'reduced':'full';
r.style.setProperty('--transcript-font',STACKS[t.fontFamily]||STACKS.sans);
r.style.setProperty('--transcript-size',t.fontSize+'rem');
r.style.setProperty('--transcript-leading',String(t.lineHeight));
r.style.setProperty('--transcript-tracking',t.letterSpacing+'em');
r.style.setProperty('--transcript-measure',t.measure+'ch');
}catch(e){}})();`;
