import cron from "node-cron";
import { runEvictionCycle } from "../services/eviction.service";

export function startEvictionWorker() {

    console.log("Eviction Worker Started");

    cron.schedule("*/1 * * * *", async () => {

        console.log("Running eviction cycle...");

        try {

            await runEvictionCycle();

        } catch (error) {

            console.error(
                "Eviction cycle failed:",
                error
            );

        }

    });
}