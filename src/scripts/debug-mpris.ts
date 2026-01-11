import { getNativeMprisAdapter } from "../services/NativeMprisAdapter";

async function test() {
  const adapter = getNativeMprisAdapter();
  console.log("Initializing adapter...");
  const initOk = await adapter.initialize();
  console.log("Initialized:", initOk);
  
  console.log("\nConnecting...");
  const connected = await adapter.connect();
  console.log("Connected:", connected);
  console.log("isConnected():", adapter.isConnected());
  
  console.log("\nGetting now playing info...");
  const nowPlaying = await adapter.getNowPlaying();
  console.log("Now Playing:", JSON.stringify(nowPlaying, null, 2));
  
  // Also check the raw mpris object
  console.log("\nChecking mpris object directly...");
  const mpris = (adapter as any).mpris;
  if (mpris) {
    console.log("mpris exists:", !!mpris);
    console.log("mpris.getState exists:", typeof mpris.getState);
    try {
      const state = mpris.getState();
      console.log("Raw state:", JSON.stringify(state, null, 2));
    } catch (e) {
      console.log("Error getting state:", e);
    }
  } else {
    console.log("mpris is null/undefined");
  }
}

test().catch(console.error);
