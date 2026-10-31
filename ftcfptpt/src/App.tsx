import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import "./style.css";

import team23321 from "./assets/Team23321.jpg";
import team28668 from "./assets/Team28668.jpg";

import moment1 from "./assets/moment1.jpg";
import moment2 from "./assets/moment2.jpg";
import moment3 from "./assets/moment3.jpg";
import moment4 from "./assets/moment4.jpg";

import AdminLogin from "./pages/AdminLogin";
import Admin from "./pages/Admin";
import CreatePost from "./pages/admin/CreatePost";
import { db } from "./firebase";

type GitHubRepo = {
  name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
};

const GITHUB_ORG =
  "FTC-FPT-Da-Nang-cap2-h-i-ng-ko-bt-code";

const EXCLUDED_REPOS = [
  "BillyDrive",
  "WebCreatePathing",
];

const repoLinks = [
  "https://github.com/BillyVNYT/FTC23321-2024-2025"
];

function ProgrammePage() {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [repositories, setRepositories] = useState<any[]>([]);

  useEffect(() => {
    const loadRepositories = async () => {
      const results = await Promise.all(
        repoLinks.map(async (url) => {
          const match = url.match(
            /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)/
          );

          if (!match) return null;

          const owner = match[1];
          const repo = match[2];

          try {
            const response = await fetch(
              `https://api.github.com/repos/${owner}/${repo}`
            );

            if (!response.ok) return null;

            return await response.json();
          } catch {
            return null;
          }
        })
      );

      setRepositories(
        results.filter((repo) => repo !== null)
      );
    };

    loadRepositories();
  }, []);

  useEffect(() => {
    fetch(
      `https://api.github.com/orgs/${GITHUB_ORG}/repos?per_page=100&sort=updated`
    )
      .then((res) => res.json())
      .then((data) => {
        const filtered = data.filter(
          (repo: GitHubRepo) =>
            !EXCLUDED_REPOS.includes(repo.name)
        );

        setRepos(filtered);
        setLoading(false);
      })
      .catch((error) => {
        console.error("GitHub API error:", error);
        setLoading(false);
      });
  }, []);

  return (
    <section className="resource-page">
      <div className="resource-page-header">
        <p className="section-label">
          RESOURCES · PROGRAMMING
        </p>

        <h1>
          PROGRAMMING
          <br />
          <span>RESOURCES.</span>
        </h1>

        <p>
          Source code, programming techniques and
          tools developed by FPT PT Robotics.
        </p>
      </div>

      {loading ? (
        <div className="resource-status">
          LOADING REPOSITORIES...
        </div>
      ) : repos.length === 0 ? (
        <div className="resource-status">
          <h2>MORE COMING SOON.</h2>
          <p>
            Programming resources will be shared here
            as our teams publish new repositories.
          </p>
        </div>
      ) : (
        <div className="resource-grid">
          {repos.map((repo) => (
            <a
              key={repo.name}
              href={repo.html_url}
              target="_blank"
              rel="noreferrer"
              className="resource-card"
            >
              <div className="resource-card-top">
                <span>
                  {repo.language || "SOURCE CODE"}
                </span>

                <span>
                  ★ {repo.stargazers_count}
                </span>
              </div>

              <h2>{repo.name}</h2>

              <p>
                {repo.description ||
                  "Open-source programming resource from FPT PT Robotics."}
              </p>

              <span className="resource-link">
                VIEW SOURCE →
              </span>
            </a>
          ))}
          {repositories.map((repo) => (
            <a
              key={repo.html_url}
              href={repo.html_url}
              target="_blank"
              rel="noreferrer"
              className="resource-card"
            >
              <div className="resource-card-top">
                <span>
                  {repo.language || "SOURCE CODE"}
                </span>

                <span>
                  ★ {repo.stargazers_count}
                </span>
              </div>

              <h3>{repo.name}</h3>

              <p>
                {repo.description ||
                  "Programming resource for FTC Robotics."}
              </p>

              <div className="resource-link">
                VIEW SOURCE →
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}


function MechanicalPage() {
  return (
    <section className="resource-page">
      <div className="resource-page-header">
        <p className="section-label">
          RESOURCES · MECHANICAL
        </p>

        <h1>
          MECHANICAL
          <br />
          <span>RESOURCES.</span>
        </h1>

        <p>
          Mechanical designs, CAD files, engineering
          documentation and robot build resources.
        </p>
      </div>

      <div className="resource-status">
        <h2>COMING SOON.</h2>

        <p>
          Our mechanical resources will be shared here.
        </p>
      </div>
    </section>
  );
}

function PricingPage() {
  const materials = [
    {
      name: "Khung robot / chassis",
      price: "1.200.000đ",
      detail: "Khung cơ bản, lắp ráp, gia cố kết cấu.",
    },
    {
      name: "Motor DC / servo",
      price: "800.000đ",
      detail: "Hệ dẫn động chủ chốt cho bánh xe và cơ cấu động lực.",
    },
    {
      name: "Bánh xe / bánh răng",
      price: "350.000đ",
      detail: "Thiết bị truyền động và tiếp xúc với mặt nền.",
    },
    {
      name: "Bộ điện / driver / nguồn",
      price: "1.500.000đ",
      detail: "Nguồn điện, driver, dây dẫn và hệ thống điện cơ bản.",
    },
    {
      name: "Mạch điều khiển / controller",
      price: "1.800.000đ",
      detail: "Phần cứng điều khiển và kết nối hệ thống robot.",
    },
    {
      name: "Vật liệu cơ khí phụ trợ",
      price: "600.000đ",
      detail: "Ốc, bulong, khớp, tấm nhôm, vật liệu gia cố.",
    },
  ];

  return (
    <section className="pricing-page">
      <div className="pricing-header">
        <p className="section-label">FPT PT ROBOTICS · MATERIAL COST</p>

        <h1>
          CHI PHÍ
          <br />
          <span>NGUYÊN LIỆU.</span>
        </h1>

        <p>
          Bảng tham khảo chi phí nguyên liệu để xây dựng robot và bộ phận cơ khí điện tử theo yêu cầu.
        </p>
      </div>

      <div className="pricing-grid">
        {materials.map((item) => (
          <article key={item.name} className="pricing-card">
            <div className="pricing-card-top">
              <span>{item.name}</span>
            </div>

            <div className="pricing-price">{item.price}</div>

            <p className="pricing-description">{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

interface PublicPost {
  id: string;
  title: string;
  description?: string;
  content?: string;
  imageUrl?: string;
  imageUrls?: string[];
  published?: boolean;
  createdAt?: {
    toDate: () => Date;
  };
}

function PostDetailPage() {
  const [post, setPost] = useState<PublicPost | null>(null);
  const [loading, setLoading] = useState(true);

  const postId = window.location.pathname.replace(/^\/posts\//, "").split("/")[0];

  useEffect(() => {
    const loadPost = async () => {
      if (!postId) {
        setLoading(false);
        return;
      }

      try {
        const postsRef = collection(db, "posts");
        const snapshot = await getDocs(postsRef);

        const foundPost = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            const imageUrls = Array.isArray(data.imageUrls)
              ? data.imageUrls
              : data.imageUrl
                ? [data.imageUrl]
                : [];

            return {
              id: doc.id,
              title: data.title || "Untitled",
              description: data.description,
              content: data.content,
              imageUrl: imageUrls[0] || "",
              imageUrls,
              published: Boolean(data.published),
              createdAt: data.createdAt,
            };
          })
          .find((item) => item.id === postId && item.published === true);

        setPost(foundPost || null);
      } catch (error) {
        console.error("Load post detail error:", error);
        setPost(null);
      } finally {
        setLoading(false);
      }
    };

    loadPost();
  }, [postId]);

  if (loading) {
    return (
      <section className="post-detail-shell">
        <div className="resource-status">LOADING POST...</div>
      </section>
    );
  }

  if (!post) {
    return (
      <section className="post-detail-shell">
        <div className="post-detail-empty">
          <p className="section-label">POST</p>
          <h2>POST NOT FOUND.</h2>
          <p>The article you are looking for is unavailable or has been removed.</p>
          <a href="/posts" className="post-detail-back">← BACK TO POSTS</a>
        </div>
      </section>
    );
  }

  const createdDate = post.createdAt?.toDate
    ? post.createdAt.toDate()
    : new Date();

  const displayImages = post.imageUrls && post.imageUrls.length > 0
    ? post.imageUrls
    : post.imageUrl
      ? [post.imageUrl]
      : [];

  const paragraphs = (post.content || "").split(/\n+/).filter(Boolean);

  return (
    <section className="post-detail-shell">
      <article className="post-detail">
        <a href="/posts" className="post-detail-back">← BACK TO POSTS</a>

        <p className="section-label">NEWS · UPDATE</p>

        <h1>{post.title}</h1>

        <div className="post-detail-meta">
          <span>
            {createdDate.toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>

        {displayImages.length > 0 && (
          <div className="post-detail-gallery">
            {displayImages.map((imageUrl, index) => (
              <img
                key={`${imageUrl}-${index}`}
                src={imageUrl}
                alt={`${post.title}-${index + 1}`}
                className="post-detail-image"
              />
            ))}
          </div>
        )}

        {paragraphs.length > 0 ? (
          <div className="post-detail-body">
            {paragraphs.map((paragraph, index) => (
              <p key={`${paragraph.slice(0, 12)}-${index}`}>{paragraph}</p>
            ))}
          </div>
        ) : (
          <div className="post-detail-body">
            <p>No content available.</p>
          </div>
        )}
      </article>
    </section>
  );
}

function BlogPage() {
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPosts = async () => {
      try {
        const postsQuery = query(
          collection(db, "posts"),
          orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(postsQuery);

        const publishedPosts = snapshot.docs
          .map((doc) => {
            const data = doc.data() as Partial<PublicPost> & {
              id?: string;
            };
            const imageUrls = Array.isArray(data.imageUrls)
              ? data.imageUrls
              : data.imageUrl
                ? [data.imageUrl]
                : [];

            return {
              id: doc.id,
              title: data.title || "Untitled",
              description: data.description,
              content: data.content,
              imageUrl: imageUrls[0] || "",
              imageUrls,
              published: Boolean(data.published),
              createdAt: data.createdAt,
            } satisfies PublicPost;
          })
          .filter((post) => post.published === true);

        setPosts(publishedPosts);
      } catch (error) {
        console.error("Load posts error:", error);
      } finally {
        setLoading(false);
      }
    };

    loadPosts();
  }, []);

  return (
    <section className="resource-page">
      <div className="resource-page-header">
        <p className="section-label">NEWS · UPDATES</p>

        <h1>
          TEAM
          <br />
          <span>POSTS.</span>
        </h1>

        <p>
          Latest stories, updates and project news from FPT PT Robotics.
        </p>
      </div>

      {loading ? (
        <div className="resource-status">LOADING POSTS...</div>
      ) : posts.length === 0 ? (
        <div className="resource-status">
          <h2>NO POSTS YET.</h2>
          <p>New updates will appear here once published.</p>
        </div>
      ) : (
        <div className="resource-grid">
          {posts.map((post) => {
            const createdDate = post.createdAt?.toDate
              ? post.createdAt.toDate()
              : new Date();
            const displayImages = post.imageUrls && post.imageUrls.length > 0
              ? post.imageUrls
              : post.imageUrl
                ? [post.imageUrl]
                : [];

            return (
              <article key={post.id} className="resource-card">
                <div className="resource-card-top">
                  <span>ARTICLE</span>
                  <span>
                    {createdDate.toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>

                {displayImages.length > 0 && (
                  <img
                    src={displayImages[0]}
                    alt={post.title}
                    className="post-card-image"
                  />
                )}

                <h2>{post.title}</h2>

                <p>
                  {(post.content || "").slice(0, 150) +
                    ((post.content || "").length > 150 ? "..." : "")}
                </p>

                <a href={`/posts/${post.id}`} className="resource-link">
                  READ MORE →
                </a>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function App() {
  const [resourcePage, setResourcePage] = useState<
    "main" | "programme" | "mechanical"
  >("main");

  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === "#resources/programme") {
        setResourcePage("programme");
      } else if (window.location.hash === "#resources/mechanical") {
        setResourcePage("mechanical");
      } else {
        setResourcePage("main");
      }
    };

    handleHash();

    window.addEventListener("hashchange", handleHash);

    return () => {
      window.removeEventListener("hashchange", handleHash);
    };
  }, []);

  const path = window.location.pathname;

  // Trang login
  if (path === "/admin/login") {
    return <AdminLogin />;
  }

  // Trang admin
  if (path === "/admin") {
    return <Admin />;
  }
  if (path === "/admin/posts/create") {
    return <CreatePost />;
  }

  if (path === "/posts") {
    return <BlogPage />;
  }

  if (path === "/pricing") {
    return <PricingPage />;
  }

  if (path.startsWith("/posts/")) {
    return <PostDetailPage />;
  }

  if (resourcePage === "programme") {
    return (
      <div className="site">
        <header className="navbar">
          <div className="nav-logo">
            <span>FPT</span>
            <strong>ROBOTICS</strong>
          </div>

          <nav>
            <a href="#home">Home</a>
            <a href="#teams">Teams</a>
            <a href="#achievements">Achievements</a>
            <a href="#gallery">Gallery</a>
            <a href="/posts">Posts</a>
            <a href="/pricing">Báo giá</a>

            <div className="resource-dropdown">
              <button>Resources ▾</button>

              <div className="resource-menu">
                <a href="#resources/mechanical">
                  Mechanical
                </a>

                <a href="#resources/programme">
                  Programme
                </a>
              </div>
            </div>
          </nav>

          <a className="nav-button" href="#teams">
            Meet the Teams
          </a>
        </header>

        <ProgrammePage />
      </div>
    );
  }

  if (resourcePage === "mechanical") {
    return (
      <div className="site">
        <header className="navbar">
          <div className="nav-logo">
            <span>FPT</span>
            <strong>ROBOTICS</strong>
          </div>

          <nav>
            <a href="#home">Home</a>
            <a href="#teams">Teams</a>
            <a href="#achievements">Achievements</a>
            <a href="#gallery">Gallery</a>
            <a href="/posts">Posts</a>
            <a href="/pricing">Báo giá</a>

            <div className="resource-dropdown">
              <button>Resources ▾</button>

              <div className="resource-menu">
                <a href="#resources/mechanical">
                  Mechanical
                </a>

                <a href="#resources/programme">
                  Programme
                </a>
              </div>
            </div>
          </nav>

          <a className="nav-button" href="#teams">
            Meet the Teams
          </a>
        </header>

        <MechanicalPage />
      </div>
    );
  }

  return (
    <div className="site">

      {/* NAVBAR */}
      <header className="navbar">
        <div className="nav-logo">
          <span>FPT</span>
          <strong>ROBOTICS</strong>
        </div>

        <nav>
          <a href="#home">Home</a>
          <a href="#teams">Teams</a>
          <a href="#achievements">Achievements</a>
          <a href="#gallery">Gallery</a>
          <a href="/posts">Posts</a>
          <a href="/pricing">Báo giá</a>

          <div className="resource-dropdown">
            <button>Resources ▾</button>

            <div className="resource-menu">
              <a href="#resources/mechanical">
                Mechanical
              </a>

              <a href="#resources/programme">
                Programme
              </a>
            </div>
          </div>
        </nav>

        <a className="nav-button" href="#teams">
          Meet the Teams
        </a>
      </header>


      {/* HERO */}
      <section className="hero" id="home">
        <div className="hero-background"></div>

        <div className="hero-content">
          <p className="hero-small">
            FIRST TECH CHALLENGE · FPT PT
          </p>

          <h1>
            BUILD.
            <br />
            <span>CREATE.</span>
            <br />
            COMPETE.
          </h1>

          <p className="hero-text">
            Two teams. One community.
            <br />
            Engineering the future through robotics.
          </p>

          <div className="hero-buttons">
            <a href="#teams" className="primary-button">
              MEET OUR TEAMS
            </a>

            <a href="#achievements" className="secondary-button">
              OUR ACHIEVEMENTS →
            </a>
          </div>
        </div>

        <div className="hero-numbers">
          <div>
            <strong>23321</strong>
            <span>FPT PT 1</span>
          </div>

          <div>
            <strong>28668</strong>
            <span>FPT PT 2</span>
          </div>
        </div>
      </section>


      {/* INTRO */}
      <section className="intro">
        <p className="section-label">01 — WHO WE ARE</p>

        <div className="intro-grid">
          <h2>
            MORE THAN
            <br />
            <span>ROBOTICS.</span>
          </h2>

          <p>
            We are students from FPT Schools, united by our passion
            for engineering, programming, design and innovation.
            Through FIRST Tech Challenge, we turn ideas into robots
            and challenges into opportunities to grow.
          </p>
        </div>
      </section>


      {/* TEAMS */}
      <section className="teams-section" id="teams">
        <div className="section-header">
          <div>
            <p className="section-label">02 — OUR TEAMS</p>

            <h2>
              MEET THE
              <br />
              <span>TEAMS.</span>
            </h2>
          </div>

          <p>
            Two FTC teams from FPT PT,
            each with its own identity,
            engineering philosophy and story.
          </p>
        </div>


        <div className="team-grid">

          {/* TEAM 23321 */}
          <article className="team-card team-one">
            <div className="team-image">
              <img src={team23321} alt="FTC Team 23321" />

              <div className="team-number">
                23321
              </div>
            </div>

            <div className="team-info">
              <p className="team-type">
                FPT PT 1 · ROOKIE 2023
              </p>

              <h3>FPT PT 1</h3>

              <p>
                One of the first FTC teams representing
                FPT PT, combining mechanical engineering,
                software and strategic game play.
              </p>

              <a href="#achievements">
                VIEW ACHIEVEMENTS →
              </a>
            </div>
          </article>


          {/* TEAM 28668 */}
          <article className="team-card team-two">
            <div className="team-image">
              <img src={team28668} alt="FTC Team 28668" />

              <div className="team-number">
                28668
              </div>
            </div>

            <div className="team-info">
              <p className="team-type">
                FPT PT 2 · ROOKIE 2024
              </p>

              <h3>FPT PT 2</h3>

              <p>
                A new generation of FPT PT robotics,
                pushing ambitious engineering and
                competition performance onto the field.
              </p>

              <a href="#achievements">
                VIEW ACHIEVEMENTS →
              </a>
            </div>
          </article>

        </div>
      </section>


      {/* ACHIEVEMENTS */}
      <section className="achievements" id="achievements">
        <div className="section-header">
          <div>
            <p className="section-label">03 — ACHIEVEMENTS</p>

            <h2>
              BUILT
              <br />
              <span>TO COMPETE.</span>
            </h2>
          </div>

          <p>
            Our journey through FIRST Tech Challenge,
            from Vietnam to international competition.
          </p>
        </div>


        <div className="achievement-list">

          <div className="achievement">
            <div className="achievement-team">
              <span>23321</span>
              <small>FPT PT 1</small>
            </div>

            <div className="achievement-title">
              <h3>Finalist Alliance</h3>
              <p>1st Team Selected · Vietnam FTC 2023–24</p>
            </div>

            <span className="achievement-year">
              2024
            </span>
          </div>


          <div className="achievement">
            <div className="achievement-team">
              <span>23321</span>
              <small>FPT PT 1</small>
            </div>

            <div className="achievement-title">
              <h3>Control Award</h3>
              <p>Vietnam Championship</p>
            </div>

            <span className="achievement-year">
              2024
            </span>
          </div>


          <div className="achievement">
            <div className="achievement-team">
              <span>23321</span>
              <small>FPT PT 1</small>
            </div>

            <div className="achievement-title">
              <h3>Finalist Alliance</h3>
              <p>Captain · Vietnam Championship</p>
            </div>

            <span className="achievement-year">
              2024
            </span>
          </div>


          <div className="achievement">
            <div className="achievement-team">
              <span>28668</span>
              <small>FPT PT 2</small>
            </div>

            <div className="achievement-title">
              <h3>Finalist Alliance</h3>
              <p>1st Team Selected · Vietnam Championship</p>
            </div>

            <span className="achievement-year">
              2025
            </span>
          </div>


          <div className="achievement">
            <div className="achievement-team">
              <span>28668</span>
              <small>FPT PT 2</small>
            </div>

            <div className="achievement-title">
              <h3>Winning Alliance</h3>
              <p>Man o' War Division · Run for the Robots Premier Event</p>
            </div>

            <span className="achievement-year">
              2025
            </span>
          </div>


          <div className="achievement">
            <div className="achievement-team">
              <span>28668</span>
              <small>FPT PT 2</small>
            </div>

            <div className="achievement-title">
              <h3>Innovate Award</h3>
              <p>2nd Place · Vietnam Championship</p>
            </div>

            <span className="achievement-year">
              2026
            </span>
          </div>

        </div>
      </section>


      {/* QUOTE */}
      <section className="quote">
        <p className="quote-mark">“</p>

        <h2>
          WE DON'T JUST
          <br />
          BUILD ROBOTS.
          <br />
          <span>WE BUILD PEOPLE.</span>
        </h2>

        <p className="quote-author">
          — FPT PT ROBOTICS
        </p>
      </section>


      {/* GALLERY */}
      <section className="gallery" id="gallery">
        <div className="section-header">
          <div>
            <p className="section-label">04 — GALLERY</p>

            <h2>
              MOMENTS
              <br />
              <span>THAT MATTER.</span>
            </h2>
          </div>
        </div>

        <div className="gallery-grid">
          <div className="gallery-item gallery-large">
            <img src={moment1} alt="FTC Robotics Moment 1" />
            <div className="gallery-caption">
              <strong>IN THE FIELD</strong>
              <span>Focus. Build. Compete.</span>
            </div>
          </div>

          <div className="gallery-item">
            <img src={moment2} alt="FTC Robotics Moment 2" />
            <div className="gallery-caption">
              <strong>TOGETHER</strong>
              <span>Ideas. People. Progress.</span>
            </div>
          </div>

          <div className="gallery-item">
            <img src={moment3} alt="FTC Robotics Moment 3" />
            <div className="gallery-caption">
              <strong>ON THE ARENA</strong>
              <span>Strategy meets reality.</span>
            </div>
          </div>

          <div className="gallery-item gallery-wide">
            <img src={moment4} alt="FTC Robotics Team" />
            <div className="gallery-caption">
              <strong>BEYOND THE GAME</strong>
              <span>A community. A journey.</span>
            </div>
          </div>

        </div>
      </section>


      {/* FOOTER */}
      <footer>
        <div className="footer-brand">
          <span>FPT</span>
          <strong>ROBOTICS</strong>
        </div>

        <p>
          FTC 23321 · FTC 28668
        </p>

        <p>
          FPT PT · Da Nang, Vietnam
        </p>

        <div className="footer-contact">
          <a
            href="https://www.facebook.com/profile.php?id=61556132914975"
            target="_blank"
            rel="noopener noreferrer"
          >
            Facebook
          </a>

          <a
            href="https://www.tiktok.com/@ftc23321fptpt"
            target="_blank"
            rel="noopener noreferrer"
          >
            TikTok
          </a>

          <a href="mailto:FPT_PT.FIRST@gmail.com">
            FPT_PT.FIRST@gmail.com
          </a>
        </div>
      </footer>

    </div>
  );
}

export default App;