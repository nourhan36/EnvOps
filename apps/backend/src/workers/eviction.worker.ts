import cron from "node-cron";
import { runEvictionCycle } from "../services/eviction.service";
// will be updated to delete expired sandboxes and their associated resources in the future
export function startEvictionWorker() {

    console.log("Eviction Worker Started");

    cron.schedule("*/1 * * * *", async () => {

        try {
            await runEvictionCycle();
        } catch (err) {
            console.error(err);
        }

    });

}