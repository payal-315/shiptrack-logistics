export const passedCheckpointIndex = (checkpoints = [], location = {}) => {
  const namedIndex = checkpoints.findIndex((checkpoint) => checkpoint.name === location.city);
  if (namedIndex >= 0) return namedIndex;
  const coordinates = location.coordinates;
  if (!coordinates || !checkpoints.length) return -1;
  return checkpoints.reduce((best, checkpoint, index) => {
    const distance = (checkpoint.coordinates.lat - coordinates.lat) ** 2 +
      (checkpoint.coordinates.lng - coordinates.lng) ** 2;
    const closest = checkpoints[best].coordinates;
    const closestDistance = (closest.lat - coordinates.lat) ** 2 +
      (closest.lng - coordinates.lng) ** 2;
    return distance < closestDistance ? index : best;
  }, 0);
};

export const currentCheckpointIndex = (checkpoints = [], location = {}) => {
  const named = checkpoints.findIndex((point) => point.name?.toLowerCase() === location.city?.toLowerCase());
  if (named >= 0) return named;
  const c = location.coordinates;
  if (!checkpoints.length) return -1;
  if (!c) return 0;
  let best = -1, nearest = Infinity;
  checkpoints.forEach((point, index) => {
    const lat = point.coordinates.lat - c.lat, lng = point.coordinates.lng - c.lng;
    const distance = lat * lat + lng * lng;
    if (distance < nearest) { nearest = distance; best = index; }
  });
  return best;
};
