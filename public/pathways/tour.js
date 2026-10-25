export const TOUR_KEY = "nexus-pathways-tour";

export function tourStore(storage) {
  return {
    done() {
      return storage.getItem(TOUR_KEY) === "done";
    },
    complete() {
      storage.setItem(TOUR_KEY, "done");
    },
    reset() {
      storage.removeItem(TOUR_KEY);
    },
  };
}
