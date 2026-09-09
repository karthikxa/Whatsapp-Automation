const token = 'EAAhrttHnaa4BSV118ZAfag9QXcNgEUlTbHUcO8d2jh7QHkdsN40cLDripKLLPeVWZCPDvhLqHF55OlqZC0Q9RvPe28X3SFhn090ZAoprIwP9ndp6Up5fFrj8wpvZB1EeycrpwSXtQL6v7kuczm6Gb0l08ebQNFoxlDSx1TqK5ZAE2znc5bbhAEP8qfVDZBlB2aLeOF8hbk5YWG3KqCQzMNglH3OYGhSONpcpX57QjA5zGMZAfytBPijVZAaknpvSzzZCijWZBsZB9qZAuvryEF0BB0pKVXwZDZD';
const wabaId = '1088619957238339';

async function run() {
  const url = 'https://graph.facebook.com/v21.0/' + wabaId + '/subscribed_apps';
  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const data = await res.json();
  console.log('Subscribed apps:', JSON.stringify(data, null, 2));
}

run();
