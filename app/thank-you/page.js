// The review button only appears once NEXT_PUBLIC_GOOGLE_REVIEW_URL is set
// in your env vars - leave it blank until you've created your Google
// Business Profile and have a real review link to paste in.
const REVIEW_URL = process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL;

// Where the "back to my projects" button sends the kid once the interview
// is fully wrapped up - the My Programs page on the main TWG site.
const MY_PROJECTS_URL = "https://www.the-woodworking-guy.com/my-programs";

export default function ThankYouPage() {
  return (
    <main className="screen">
      <img className="mascot" src="/woodworking-guy.webp" alt="The Woodworking Guy" />
      <h1>Thanks for chatting!</h1>
      <p className="subtitle">
        You just helped make the next project even better. Great work on
        your build — see you next time!
      </p>
      <a className="primary" href={MY_PROJECTS_URL} style={{ textDecoration: "none", display: "inline-block" }}>
        Back to My Projects
      </a>
      {REVIEW_URL && (
        <a
          className="review-link"
          href={REVIEW_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          ⭐ Enjoyed this? Leave us a Google review!
        </a>
      )}
    </main>
  );
}
