import api from "./api";

export const getPlatformStats = () =>
  api.get("/platform/stats").then((response) => response.data);

export const getPlatformPartners = () =>
  api.get("/platform/partners").then((response) => response.data);

export const saveCreatorProfile = (profile) =>
  api.put("/platform/creator-profile", profile).then((response) => response.data);
