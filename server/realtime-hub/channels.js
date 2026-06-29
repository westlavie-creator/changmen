/** @typedef {"Polymarket:PmSport"} ChangmenRealtimeChannel */

export const PM_SPORT_CHANNEL = "Polymarket:PmSport";

/** Socket.IO 挂载路径（与 ws-forward 的 /esport/ws-forward 并列） */
export const REALTIME_SOCKET_PATH = "/esport/realtime/socket.io";

export const REALTIME_URL_PREFIX = "/esport/realtime";

/** @param {string} urlPath */
export function isChangmenRealtimeHttpPath(urlPath) {
  return urlPath === REALTIME_URL_PREFIX
    || urlPath.startsWith(`${REALTIME_URL_PREFIX}/`);
}
