export function explorationContextPath(path) {
  return path.length>12 ? [path[0],...path.slice(-11)] : path;
}
