import Slack from "@slack/bolt";
import { PrismaClient } from "@prisma/client";
import prettyms from "pretty-ms";
import "dotenv/config";

const prisma = new PrismaClient();

const expressReceiver = new Slack.ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const expressApp = expressReceiver.app;

const app = new Slack.App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: expressReceiver,
});

let count = 0;

expressApp.get("/refresh", async (req, res) => {
  await refreshTasks();
  res.status(200).send("the backlog has been refreshed!");
});

async function refreshTasks() {
  const data = new FormData();
  data.set("token", process.env.SLACK_CLIENT_TOKEN);
  data.set("_x_app_name", "client");
  data.set("_x_reason", "saved-api/savedList");
  data.set("_x_mode", "online");
  data.set("_x_sonic", "true");
  data.set("filter", "saved");

  await fetch(
    "https://hackclub.slack.com/api/saved.list?_x_id=829ee587-1712708450.151&_x_csid=JmcOvVbEE0U&slack_route=T0266FRGM&_x_version_ts=1712706141&_x_frontend_build_type=current&_x_desktop_ia=4&_x_gantry=true&fp=22",
    {
      method: "POST",
      body: data,
      headers: {
        Cookie: process.env.SLACK_COOKIE,
      },
    },
  )
    .then((res) => res.json())
    .then(async (data) => {
      if (data.ok) {
        count =
          data.counts.uncompleted_count + data.counts.uncompleted_overdue_count;

        const savedIds = data.saved_items.map((i) => i.ts);
        for (const item in data.saved_items) {
          await prisma.item.upsert({
            where: {
              ts: item.ts,
            },
            create: {
              ts: item.ts,
              timeAdded: new Date(e.date_created * 1000),
              timeRemoved: null,
            },
            update: {
              timeAdded: new Date(e.date_created * 1000),
              timeRemoved: null,
            },
          });
        }

        const currentItems = await prisma.item.findMany({
          where: {
            timeRemoved: null,
          },
        });

        const removedItems = currentItems.filter((i) => !savedIds.includes(i));

        for (const item in removedItems) {
          await prisma.item.update({
            where: {
              ts: item,
            },
            data: {
              timeRemoved: new Date(),
            },
          });
        }

        updateCount();
      }
    });
}

async function calculateAverage() {
  const tasks = await prisma.item.findMany({
    where: {
      timeRemoved: {
        not: null,
      },
    },
    orderBy: {
      timeAdded: "desc",
    },
    take: 50,
  });

  const total = tasks.reduce((acc, task) => {
    return acc + task.timeRemoved.valueOf() - task.timeAdded.valueOf();
  }, 0);

  const avg = total / tasks.length;

  return isNaN(avg) ? "N/A" : prettyms(avg);
}

async function updateCount() {
  const bookmarks = await app.client.bookmarks.list({
    channel_id: process.env.SLACK_CHANNEL_ID,
  });

  const countId = bookmarks.bookmarks.find(
    (bookmark) => bookmark.emoji === ":bookmark:",
  )?.id;
  const timeId = bookmarks.bookmarks.find(
    (bookmark) => bookmark.emoji === ":alarm_clock:",
  )?.id;

  app.client.bookmarks.edit({
    bookmark_id: countId,
    channel_id: process.env.SLACK_CHANNEL_ID,
    title: `${count} items to complete!`,
  });

  app.client.bookmarks.edit({
    bookmark_id: timeId,
    channel_id: process.env.SLACK_CHANNEL_ID,
    title: `Avg time per task: ${await calculateAverage()}`,
  });
}

setInterval(refreshTasks, 60 * 1000);

(async () => {
  await refreshTasks();
  await app.start(process.env.PORT ?? 3000);
  console.log("Now tracking Samuel's backlog!");
})();
