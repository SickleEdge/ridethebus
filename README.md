# Ride the Bus Card Game

A web-based implementation of the popular drinking card game "Ride the Bus" built with Next.js, Tailwind CSS, and Framer Motion.

![Ride the Bus Screenshot](public/card-game-screenshot.png)

## Demo

Check out the live demo: [https://sickleedge.github.io/ridethebus/](https://sickleedge.github.io/ridethebus/)

## Features

- Beautiful card animations and visual effects
- Single-player mode with score tracking
- Multiplayer mode with WebSocket support
- Mobile-responsive design
- Customizable game rules

## How to Play

1. **Red or Black:** Guess if the next card is red or black.
2. **Higher or Lower:** Guess if the next card is higher or lower than the previous one.
3. **Inside or Outside:** Guess if the next card is inside or outside the range of the first two cards.
4. **Guess the Suit:** Guess the suit of the next card (hearts, diamonds, clubs, or spades).

## Local Development

```bash
# Install dependencies
npm install

# Run the development server
npm run dev

# Run the WebSocket server for multiplayer
npm run server
```

## Deploying to GitHub Pages

This project is configured for easy deployment to GitHub Pages:

1. Fork this repository to your own GitHub account
2. Go to the repository settings and enable GitHub Pages
3. In the repository settings, go to "Pages" and select the "GitHub Actions" source
4. The GitHub Action will automatically build and deploy the site when you push to the main branch

## Configuring WebSocket Server for Production

For the multiplayer mode to work in production, you need to set up a WebSocket server:

1. Set up a WebSocket server on a platform of your choice (Heroku, Render, etc.)
2. Update the WebSocket URL in the following files:
   - `app/multiplayer/components/RoomList.tsx`
   - `app/game/page.tsx`

Look for the `getWebSocketUrl` and `getWebSocketBaseUrl` functions and update the production URL:

```javascript
// When hosted on GitHub Pages or other production environment
return "wss://your-websocket-server.com";
```

## Technologies Used

- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Framer Motion](https://www.framer.com/motion/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)

## License

MIT License - See [LICENSE](LICENSE) for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 