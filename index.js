import Slack from '@slack/bolt';
import 'dotenv/config';

const app = new Slack.App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

let count = 0;

app.event('star_added', async () => {
	count++;
	updateCount();
});

app.event('star_removed', async () => {
	count--;
	updateCount();
});

const authData = new FormData();
authData.set('token', process.env.SLACK_CLIENT_TOKEN);
authData.set('_x_app_name', 'client');
authData.set('_x_reason', 'saved-api/savedList');
authData.set('_x_mode', 'online');
authData.set('_x_sonic', 'true');

fetch("https://hackclub.slack.com/api/saved.list?_x_id=829ee587-1712708450.151&_x_csid=JmcOvVbEE0U&slack_route=T0266FRGM&_x_version_ts=1712706141&_x_frontend_build_type=current&_x_desktop_ia=4&_x_gantry=true&fp=22", {
	method: "POST",
	body: authData,
	headers: {
		"Cookie": process.env.SLACK_COOKIE,
	}
}).then(res => res.json()).then(data => {
	if (data.ok) {
		count = data.counts.uncompleted_count + data.counts.uncompleted_overdue_count;
		updateCount();
	}
});

async function updateCount() {
	const bookmarks = await app.client.bookmarks.list({
		channel_id: process.env.SLACK_CHANNEL_ID,
	});

	const bookmarkId = bookmarks.bookmarks.find(bookmark => bookmark.emoji === ":bookmark:")?.id;

	app.client.bookmarks.edit({
		bookmark_id: bookmarkId,
		channel_id: process.env.SLACK_CHANNEL_ID,
		title: `${count} items to complete!`
	})
}

(async () => {
  await app.start();
  console.log("Now tracking Samuel's backlog!");
})();