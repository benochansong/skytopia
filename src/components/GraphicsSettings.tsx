import { useGame } from '../stores/gameStore';
import { useVisual } from '../stores/visualStore';
import { PHOTO_PRESETS, QUALITY, qualityPatch, type Quality, type PhotoPreset } from '../scene/art';

export function GraphicsSettings() {
  const s = useGame((x) => x.settings),
    set = useGame((x) => x.configure),
    ko = s.language === 'ko';
  return (
    <fieldset className="control-settings">
      <legend>{ko ? '그래픽 · 시각 효과' : 'Graphics · visual effects'}</legend>
      <label>
        {ko ? '화질' : 'Quality'}
        <select
          aria-label={ko ? '화질' : 'Quality'}
          value={s.quality}
          onChange={(e) => set(qualityPatch(e.target.value as Quality))}
        >
          {Object.keys(QUALITY).map((q) => (
            <option key={q} value={q}>
              {q.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <label>
        {ko ? '구름 밀도' : 'Cloud density'}
        <input
          aria-label={ko ? '구름 밀도' : 'Cloud density'}
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={s.cloudDensity}
          onChange={(e) => set({ cloudDensity: Number(e.target.value) })}
        />
      </label>
      <small>
        {ko
          ? '화질은 해상도·그림자·장식 수만 바꿉니다. 개별 접근성 설정과 게임 판정은 유지됩니다.'
          : 'Quality changes resolution, shadows and decoration counts. Accessibility choices and game rules are preserved.'}
      </small>
    </fieldset>
  );
}
export function PhotoSettings() {
  const v = useVisual(),
    ko = useGame((s) => s.settings.language === 'ko');
  const names = ko
    ? ['실제 환경', '일출', '맑은 낮', '황금빛 저녁', '밤', '시네마틱', '설계도']
    : ['Live', 'Sunrise', 'Clear day', 'Golden hour', 'Night', 'Cinematic', 'Blueprint'];
  return (
    <>
      <label>
        {ko ? '사진 분위기' : 'Photo look'}
        <select
          aria-label={ko ? '사진 분위기' : 'Photo look'}
          value={v.preset}
          onChange={(e) => v.set({ preset: e.target.value as PhotoPreset })}
        >
          {PHOTO_PRESETS.map((p, i) => (
            <option key={p} value={p}>
              {names[i]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {ko ? '사진 구름' : 'Photo clouds'}
        <input
          type="range"
          aria-label={ko ? '사진 구름' : 'Photo clouds'}
          min="0"
          max="1"
          step="0.1"
          value={v.clouds}
          onChange={(e) => v.set({ clouds: Number(e.target.value) })}
        />
      </label>
      <label>
        {ko ? '사진 크기' : 'Capture size'}
        <select
          aria-label={ko ? '사진 크기' : 'Capture size'}
          value={v.captureScale}
          onChange={(e) => v.set({ captureScale: Number(e.target.value) as 1 | 2 })}
        >
          <option value="1">1×</option>
          <option value="2">2× · ≤ 3840px</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={v.watermark}
          onChange={(e) => v.set({ watermark: e.target.checked })}
        />
        {ko ? '로고 넣기' : 'Add logo'}
      </label>
    </>
  );
}
