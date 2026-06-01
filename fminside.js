```js
import axios from 'axios';

export async function searchFMInside(player) {
  try {
    const url = `https://fminside.net/players/search?query=${encodeURIComponent(player)}`;

    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    return response.data.slice(0, 5000);

  } catch (error) {
    console.error('FMInside fout:', error.message);
    return null;
  }
}
```
