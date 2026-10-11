import api from "./api";

export const getPlatformStats = () =>
  api.get("/platform/stats").then((response) => response.data);
