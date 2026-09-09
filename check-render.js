async function check() {
  const apiKey = 'rnd_vFItccz0IdrLA3HHykpALAmHJygU';
  const serviceId = 'srv-dagh3ln40ujc73f688qg';
  const deployId = 'dep-dagh3m740ujc73f68adg';

  const url = 'https://api.render.com/v1/services/' + serviceId + '/deploys/' + deployId;
  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + apiKey }
  });
  const data = await res.json();
  console.log('Deploy status:', data.status, 'finishedAt:', data.finishedAt || 'building...');
}

check();
