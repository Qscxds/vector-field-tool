/**
 * The "last trajectory" text of the interactive shells, shared by the web page and the widget.
 * Pure and React-free: a Scene, the trajectories traced from one point, a label table -> lines.
 *
 * Why it is mode-aware: a TrajectoryView's tEnd is the integration PARAMETER of the reduced planar
 * system, starting at 0 at the clicked point. That is the student's t only for a planar system.
 * - Explicit first-order scene (system.variables "ty", arrows): t' = 1, so "forward (t increasing)"
 *   is right, but the number shown must be the t COORDINATE reached, i.e. the end point's x.
 * - Differential form (fieldStyle "segments"): M dt + N dy = 0 has no natural direction, so the two
 *   sides are listed without direction words and without a t number.
 * - Planar system: direction and tEnd as before.
 */
import { fill, formatNumber, type LabelTable } from "./labels";
import type { Scene, TrajectoryView } from "./scene";

export type TrajectoryMode = "planar" | "explicit" | "differential";

/** How a scene's trajectories should be described (see the header). */
export function trajectoryMode(scene: Pick<Scene, "system" | "fieldStyle">): TrajectoryMode {
  if (scene.system?.variables !== "ty") return "planar";
  return scene.fieldStyle === "segments" ? "differential" : "explicit";
}

/**
 * Status sentence of one trajectory, with the far-box wording when it stopped at the far stop box.
 * Over a non-autonomous system (`timeDependent` set on the scene) the integrator's
 * 'reached_equilibrium' only means that the speed fell close to zero at that time: the field
 * there changes with t, so it is worded neutrally instead of as an equilibrium (the status key
 * itself is unchanged; the integrator is not touched). On a differential form (`differential`)
 * the statuses that speak of time are reworded: the kernel's parameter is not the student's t
 * (round P2.1), and its "equilibrium" is a point where M = N = 0.
 */
export function trajectoryStatus(t: TrajectoryView, L: LabelTable, timeDependent?: Scene["timeDependent"], picture: StatusPicture = "planar"): string {
  if (t.status === "left_box" && t.stop === "far") return L.ui.leftFarBox;
  return statusSentence(t.status, L, timeDependent, picture);
}

/**
 * What the picture is, for the status wording (round P2): a planar phase plane; the graph of a
 * first-order solution y(t) ("explicit"); a differential form, which has no time and no direction;
 * a second-order phase plane (x, x'), whose "position" and "speed" are the student's x and x'.
 */
export type StatusPicture = "planar" | "explicit" | "differential" | "second";

/** The picture of a scene for the status wording (trajectoryMode plus the second-order flag). */
export function statusPictureOf(scene: Pick<Scene, "system" | "fieldStyle" | "secondOrder">): StatusPicture {
  if (scene.secondOrder) return "second";
  return trajectoryMode(scene);
}

/** The wording of an integration status, non-autonomous and picture aware (see trajectoryStatus). */
export function statusSentence(status: TrajectoryView["status"], L: LabelTable, timeDependent?: Scene["timeDependent"], picture: StatusPicture = "planar"): string {
  if (picture === "differential") {
    if (status === "completed") return L.tool.completedDiff;
    if (status === "max_steps") return L.tool.maxStepsDiff;
    if (status === "reached_equilibrium") return L.tool.reachedSingularDiff;
    if (status === "blew_up") return L.tool.blewUpDiff;
  }
  if (picture === "explicit" && status === "blew_up") return L.tool.blewUpFirst;
  if (picture === "second") {
    if (status === "blew_up") return L.tool.blewUpSecond;
    if (status === "reached_equilibrium") return timeDependent ? L.tool.stoppedNonAutonomousSecond : L.tool.reachedEquilibriumSecond;
  }
  return status === "reached_equilibrium" && timeDependent ? L.tool.stoppedNonAutonomous : L.status[status];
}

/**
 * Splits a trajectory list into the groups traced from one point: a forward trajectory immediately
 * followed by a backward one is a pair (traceBoth and the tools emit them in that order); anything
 * else stands alone.
 */
export function groupTrajectories(trajectories: readonly TrajectoryView[]): TrajectoryView[][] {
  const groups: TrajectoryView[][] = [];
  for (let i = 0; i < trajectories.length; i++) {
    const t = trajectories[i];
    const next = trajectories[i + 1];
    if (t.direction === "forward" && next?.direction === "backward") {
      groups.push([t, next]);
      i++;
    } else {
      groups.push([t]);
    }
  }
  return groups;
}

/**
 * Lines describing one group (a forward/backward pair or a single direction):
 * - planar: one line per trajectory, "<direction> to t = <tEnd>, <status>";
 * - explicit first order: one line per trajectory, "<direction> to t = <end point's t>, <status>";
 * - differential form: a single line "one side: <status>; other side: <status>".
 */
export function trajectoryLines(scene: Pick<Scene, "system" | "fieldStyle" | "timeDependent" | "secondOrder">, group: readonly TrajectoryView[], L: LabelTable): string[] {
  const mode = trajectoryMode(scene);
  const picture = statusPictureOf(scene);
  // A curve through a point where uniqueness fails (TrajectoryView.nonUnique) gets the sentence
  // once per group, after the status lines.
  const nonUnique = group.some((t) => t.nonUnique) ? [L.ui.nonUniqueTrajectory] : [];
  if (mode === "differential") {
    const sides = group.map((t) => trajectoryStatus(t, L, scene.timeDependent, "differential"));
    if (sides.length < 2) return [...sides, ...nonUnique];
    return [fill(L.ui.trajectorySides, { first: sides[0], second: sides[1] }), ...nonUnique];
  }
  const lines = group.map((t) => {
    const direction = t.direction === "forward" ? L.tool.forward : L.tool.backward;
    const status = trajectoryStatus(t, L, scene.timeDependent, picture);
    if (mode === "explicit") {
      const end = t.points[t.points.length - 1];
      return `${direction} ${fill(L.ui.towardT, { t: formatNumber(end.x, 2), status })}`;
    }
    return `${direction} ${fill(L.ui.toward, { t: formatNumber(t.tEnd, 2), status })}`;
  });
  return [...lines, ...nonUnique];
}
