import type { Stage } from '../render/stage.ts';

// World-space target brackets drawn in the DOM, after Beta Decay: dashed
// corner brackets, a filled label chip above, a distance chip below.
// Updated every frame outside Svelte, so it costs no reactivity.

interface Bracket {
  root: HTMLElement;
  label: HTMLElement;
  sub: HTMLElement;
}

function makeBracket(kind: 'selected' | 'target'): Bracket {
  const root = document.createElement('div');
  root.className = `bracket bracket-${kind}`;
  root.innerHTML = '<span class="chip"></span><span class="corners"></span><span class="sub"></span>';
  root.hidden = true;
  document.body.appendChild(root);
  return { root, label: root.querySelector('.chip')!, sub: root.querySelector('.sub')! };
}

export class Overlay {
  private readonly selected = makeBracket('selected');
  private readonly target = makeBracket('target');

  hide(): void {
    this.selected.root.hidden = true;
    this.target.root.hidden = true;
  }

  update(stage: Stage, selected: number, target: number, names: string[]): void {
    this.place(stage, this.selected, selected, names[selected] ?? '', '');
    const range = selected >= 0 && target >= 0 ? stage.distance(selected, target) : -1;
    this.place(stage, this.target, target, names[target] ?? '', range >= 0 ? `${(range / 1000).toFixed(2)} KM` : '');
  }

  private place(stage: Stage, b: Bracket, unit: number, label: string, sub: string): void {
    const p = unit >= 0 ? stage.project(unit) : null;
    if (!p) {
      b.root.hidden = true;
      return;
    }
    const size = Math.max(24, stage.pixelRadius(unit) * 2.8);
    b.root.hidden = false;
    b.root.style.transform = `translate(${p.x - size / 2}px, ${p.y - size / 2}px)`;
    b.root.style.width = `${size}px`;
    b.root.style.height = `${size}px`;
    b.label.textContent = label;
    b.sub.textContent = sub;
  }
}
