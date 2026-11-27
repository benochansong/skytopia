import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { MeshBasicMaterial, Vector2 } from 'three';
import { useGame } from '../stores/gameStore';
import { useVisual } from '../stores/visualStore';

export function PhotoCapture() {
  const { gl, scene, camera } = useThree();
  const photo = useGame((s) => s.photoMode),
    preset = useVisual((s) => s.preset);
  const blueprint = useMemo(() => new MeshBasicMaterial({ color: '#88e2ff', wireframe: true }), []);
  useEffect(() => {
    scene.overrideMaterial = photo && preset === 'blueprint' ? blueprint : null;
    return () => {
      scene.overrideMaterial = null;
    };
  }, [photo, preset, scene, blueprint]);
  useEffect(() => () => blueprint.dispose(), [blueprint]);
  useEffect(() => {
    let busy = false;
    const done = (ok: boolean) => {
      busy = false;
      window.dispatchEvent(new CustomEvent('skytopia:captured', { detail: ok }));
    };
    const capture = () => {
      if (busy || !useGame.getState().photoMode) return;
      busy = true;
      const size = gl.getSize(new Vector2()),
        ratio = gl.getPixelRatio(),
        v = useVisual.getState();
      try {
        // Bound physical dimensions and restore the renderer before the next frame.
        gl.setPixelRatio(Math.min(ratio * v.captureScale, 3840 / Math.max(size.x, size.y)));
        gl.render(scene, camera);
        const canvas = document.createElement('canvas');
        canvas.width = gl.domElement.width;
        canvas.height = gl.domElement.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(gl.domElement, 0, 0);
        if (v.watermark) {
          const margin = Math.max(24, canvas.width * 0.025);
          ctx.font = `600 ${Math.round(canvas.width * 0.018)}px sans-serif`;
          ctx.shadowColor = '#172a48';
          ctx.shadowBlur = 5;
          ctx.fillStyle = '#e8bc67';
          ctx.fillText('◇ SKYTOPIA · AETHER RISING', margin, canvas.height - margin);
        }
        canvas.toBlob((blob) => {
          if (!blob) {
            done(false);
            return;
          }
          const url = URL.createObjectURL(blob),
            link = document.createElement('a');
          link.href = url;
          link.download = `skytopia-${Date.now()}.png`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          done(true);
        }, 'image/png');
      } catch {
        done(false);
      } finally {
        gl.setPixelRatio(ratio);
        gl.setSize(size.x, size.y, false);
      }
    };
    window.addEventListener('skytopia:capture', capture);
    return () => window.removeEventListener('skytopia:capture', capture);
  }, [gl, scene, camera]);
  return null;
}
