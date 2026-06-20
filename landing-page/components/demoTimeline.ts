export interface DemoLine {
  readonly original: string;
  readonly translated: string;
}

export interface DemoTimelineItem extends DemoLine {
  delayMs: number;
}

export function buildDemoTimeline(lines: readonly DemoLine[]): DemoTimelineItem[] {
  return lines.map((line, index) => ({
    ...line,
    delayMs: index * 900,
  }));
}
