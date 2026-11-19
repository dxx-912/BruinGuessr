/**
 * Which way the back camera faces, from the phone's orientation sensors.
 * Magnetic: the server turns it into true north (rules.ts, trueHeading).
 */

/**
 * The compass heading of the back of the device (where the rear camera
 * looks), in degrees clockwise from north, from an absolute device
 * orientation (alpha, beta, gamma in degrees; the W3C DeviceOrientation
 * spec's worked example). Null when the phone lies nearly flat, where the
 * camera points at the ground and has no useful heading.
 */
export function cameraHeading(alpha: number | null, beta: number | null, gamma: number | null): number | null {
  if (alpha === null || beta === null || gamma === null) return null;
  const rad = Math.PI / 180;
  const x = beta * rad;
  const y = gamma * rad;
  const z = alpha * rad;
  const cY = Math.cos(y);
  const cZ = Math.cos(z);
  const sX = Math.sin(x);
  const sY = Math.sin(y);
  const sZ = Math.sin(z);
  // The horizontal part of the vector out of the back of the screen.
  const vx = -cZ * sY - sZ * sX * cY;
  const vy = -sZ * sY + cZ * sX * cY;
  if (Math.hypot(vx, vy) < 0.35) return null;
  const heading = (Math.atan2(vx, vy) / rad + 360) % 360;
  return Math.round(heading * 10) / 10;
}

/** "NE", "SSW"… for a heading. */
export function compassPoint(heading: number): string {
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return points[Math.round((((heading % 360) + 360) % 360) / 22.5) % 16];
}
