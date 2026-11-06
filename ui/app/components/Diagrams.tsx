import React from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";

/**
 * Three diagrams for the Getting started page, drawn as inline SVG so they stay sharp at any size
 * and take their colours from the theme tokens (light and dark mode both work). They are
 * illustrations of how the app works, not charts of data, so they are plain shapes and short labels.
 */

const FONT = "inherit";

interface BoxProps {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string;
  /** The app's own part of the flow is drawn in the accent colour. */
  accent?: boolean;
}

const Box = ({ x, y, w, h, title, sub, accent }: BoxProps) => (
  <g>
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={10}
      style={{
        fill: accent
          ? Colors.Background.Container.Primary.Default
          : Colors.Background.Surface.Default,
        stroke: accent
          ? Colors.Border.Primary.Default
          : Colors.Border.Neutral.Default,
        strokeWidth: accent ? 2 : 1,
      }}
    />
    <text
      x={x + w / 2}
      y={y + (sub ? h / 2 - 6 : h / 2 + 5)}
      textAnchor="middle"
      style={{
        fill: Colors.Text.Neutral.Default,
        fontFamily: FONT,
        fontSize: 15,
        fontWeight: 600,
      }}
    >
      {title}
    </text>
    {sub && (
      <text
        x={x + w / 2}
        y={y + h / 2 + 14}
        textAnchor="middle"
        style={{
          fill: Colors.Text.Neutral.Subdued,
          fontFamily: FONT,
          fontSize: 12,
        }}
      >
        {sub}
      </text>
    )}
  </g>
);

/** A straight arrow from (x1,y1) to (x2,y2), with the head turned to follow the line. */
const Arrow = ({
  x1,
  y1,
  x2,
  y2,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) => (
  <g
    style={{
      stroke: Colors.Border.Neutral.Default,
      strokeWidth: 2,
      fill: Colors.Border.Neutral.Default,
    }}
  >
    <line x1={x1} y1={y1} x2={x2} y2={y2} />
    <polygon
      points="0,0 -9,-5 -9,5"
      transform={`translate(${x2} ${y2}) rotate(${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI})`}
      style={{ stroke: "none" }}
    />
  </g>
);

const Label = ({
  x,
  y,
  children,
  anchor = "middle",
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  anchor?: "start" | "middle" | "end";
}) => (
  <text
    x={x}
    y={y}
    textAnchor={anchor}
    style={{
      fill: Colors.Text.Neutral.Subdued,
      fontFamily: FONT,
      fontSize: 12,
    }}
  >
    {children}
  </text>
);

const Svg = ({
  width,
  height,
  label,
  children,
}: {
  width: number;
  height: number;
  label: string;
  children: React.ReactNode;
}) => (
  <svg
    viewBox={`0 0 ${width} ${height}`}
    role="img"
    aria-label={label}
    style={{ width: "100%", height: "auto", maxWidth: width }}
  >
    {children}
  </svg>
);

/** The whole journey of one event, from detector to downstream tool. */
export const JourneyDiagram = () => {
  const w = 148;
  const gap = 34;
  const y = 20;
  const h = 76;
  const xs = [0, 1, 2, 3, 4, 5].map((i) => 8 + i * (w + gap));
  const stages = [
    { title: "Davis event", sub: "raised by a detector" },
    { title: "Route", sub: "first match wins" },
    { title: "Your pipeline", sub: "applies your rules" },
    { title: "Event stored", sub: "with event.severity" },
    { title: "Problem", sub: "most severe event" },
    { title: "Workflow", sub: "e.g. ServiceNow" },
  ];
  return (
    <Svg
      width={1100}
      height={150}
      label="An event is raised, routed to a pipeline that applies your rules, stored with a severity, and rolled up into a problem"
    >
      {stages.map((s, i) => (
        <Box
          key={s.title}
          x={xs[i]}
          y={y}
          w={w}
          h={h}
          title={s.title}
          sub={s.sub}
          accent={i === 1 || i === 2}
        />
      ))}
      {xs.slice(0, -1).map((x, i) => (
        <Arrow
          key={i}
          x1={x + w + 4}
          y1={y + h / 2}
          x2={xs[i + 1] - 4}
          y2={y + h / 2}
        />
      ))}
      {/* The part this app manages */}
      <line
        x1={xs[1]}
        y1={y + h + 18}
        x2={xs[2] + w}
        y2={y + h + 18}
        style={{ stroke: Colors.Border.Primary.Default, strokeWidth: 3 }}
      />
      <Label x={(xs[1] + xs[2] + w) / 2} y={y + h + 40}>
        Managed by Severity Assistant
      </Label>
    </Svg>
  );
};

/** What the rules become inside the pipeline. */
export const InsidePipelineDiagram = () => {
  const w = 300;
  const h = 96;
  const y = 14;
  const xs = [0, 1, 2].map((i) => 8 + i * (w + 56));
  return (
    <Svg
      width={1010}
      height={150}
      label="Inside the pipeline: a system-wide default, then label-based exceptions, then the severity is applied"
    >
      <Box
        x={xs[0]}
        y={y}
        w={w}
        h={h}
        title="1. System-wide default"
        sub={'"CPU Saturation is 3 Medium"'}
      />
      <Box
        x={xs[1]}
        y={y}
        w={w}
        h={h}
        title="2. Label-based exceptions"
        sub={'"...but 1 Critical for bu1"'}
      />
      <Box
        x={xs[2]}
        y={y}
        w={w}
        h={h}
        title="3. Apply"
        sub="writes event.severity"
        accent
      />
      <Arrow x1={xs[0] + w + 4} y1={y + h / 2} x2={xs[1] - 4} y2={y + h / 2} />
      <Arrow x1={xs[1] + w + 4} y1={y + h / 2} x2={xs[2] - 4} y2={y + h / 2} />
      <Label x={xs[0] + w / 2} y={y + h + 28}>
        one per event or detector
      </Label>
      <Label x={xs[1] + w / 2} y={y + h + 28}>
        in order: the last match wins
      </Label>
      <Label x={xs[2] + w / 2} y={y + h + 28}>
        and records what decided it
      </Label>
    </Svg>
  );
};

/** Why a team can have its own rules without affecting anyone else. */
export const ProfilesDiagram = () => (
  <Svg
    width={1010}
    height={250}
    label="An event is tested against each route in order; the first that matches sends it to that profile's pipeline"
  >
    <Box x={8} y={90} w={170} h={70} title="Davis event" sub="arrives" />

    <Box
      x={250}
      y={14}
      w={250}
      h={64}
      title="Team Alpha route"
      sub="matcher: bu = alpha"
      accent
    />
    <Box
      x={250}
      y={96}
      w={250}
      h={64}
      title="Default route"
      sub="matcher: every event"
      accent
    />
    <Box x={250} y={178} w={250} h={64} title="No route matched" sub="" />

    <Box
      x={620}
      y={14}
      w={250}
      h={64}
      title="Team Alpha pipeline"
      sub="Alpha's own rules"
      accent
    />
    <Box
      x={620}
      y={96}
      w={250}
      h={64}
      title="Default pipeline"
      sub="the default rules"
      accent
    />
    <Box
      x={620}
      y={178}
      w={250}
      h={64}
      title="Built-in pipeline"
      sub="left as it is"
    />

    <Arrow x1={182} y1={125} x2={246} y2={46} />
    <Arrow x1={182} y1={125} x2={246} y2={128} />
    <Arrow x1={182} y1={125} x2={246} y2={210} />
    <Arrow x1={504} y1={46} x2={616} y2={46} />
    <Arrow x1={504} y1={128} x2={616} y2={128} />
    <Arrow x1={504} y1={210} x2={616} y2={210} />

    <Label x={560} y={36}>
      yes
    </Label>
    <Label x={560} y={118}>
      otherwise
    </Label>
    <Label x={880} y={52} anchor="start">
      sees only its events
    </Label>
    <Label x={880} y={134} anchor="start">
      sees what is left
    </Label>
  </Svg>
);
