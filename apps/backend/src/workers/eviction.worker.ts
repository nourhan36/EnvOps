import cron from "node-cron";
import { runEvictionCycle } from "../services/eviction.service";

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