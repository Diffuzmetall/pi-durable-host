// Resource-free reload boundary. The integration retains the Component, lease and listener;
// each admitted audio operation pins this factory's returned host until its lease releases.
export function createAudioHost(options, createNativeGippityAudioHost) {
  return createNativeGippityAudioHost(options);
}
