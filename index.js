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

app.event("star_added", async (e) => {
  await prisma.item.upsert({
    where: {
      ts: e.payload.item.message.ts,
    },
    create: {
      ts: e.payload.item.message.ts,
      timeAdded: new Date(),
      timeRemoved: null,
    },
    update: {
      timeAdded: new Date(),
      timeRemoved: null,
    },
  });

  count++;
  updateCount();
});

app.event("star_removed", async (e) => {
  try {
    await prisma.item.update({
      where: {
        ts: e.payload.item.message.ts,
      },
      data: {
        timeRemoved: new Date(),
      },
    });
  } catch (e) {
    console.error(e);
  }

  count--;
  updateCount();
});

async function refreshTasks() {
  const authData = new FormData();
  authData.set("token", process.env.SLACK_CLIENT_TOKEN);
  authData.set("_x_app_name", "client");
  authData.set("_x_reason", "saved-api/savedList");
  authData.set("_x_mode", "online");
  authData.set("_x_sonic", "true");

  await fetch(
    "https://hackclub.slack.com/api/saved.list?_x_id=829ee587-1712708450.151&_x_csid=JmcOvVbEE0U&slack_route=T0266FRGM&_x_version_ts=1712706141&_x_frontend_build_type=current&_x_desktop_ia=4&_x_gantry=true&fp=22",
    {
      method: "POST",
      body: authData,
      headers: {
        Cookie: process.env.SLACK_COOKIE,
      },
    },
  )
    .then((res) => res.json())
    .then((data) => {
      if (data.ok) {
        count =
          data.counts.uncompleted_count + data.counts.uncompleted_overdue_count;
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

(async () => {
  await refreshTasks();
  await app.start(process.env.PORT ?? 3000);
  console.log("Now tracking Samuel's backlog!");
})();
