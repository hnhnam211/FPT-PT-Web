import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

import { db } from "../firebase";

interface ViewData {
  date: string;
  views: number;
}

interface Post {
  id: string;
  title: string;
  published: boolean;
  createdAt?: any;
}

function Admin() {
  const [views, setViews] = useState<ViewData[]>([]);
  const [totalViews, setTotalViews] = useState(0);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      // =========================
      // LOAD VIEWS
      // =========================

      const viewsSnapshot = await getDocs(
        collection(db, "views")
      );

      const viewMap: Record<string, number> = {};

      viewsSnapshot.forEach((doc) => {
        const data = doc.data();

        if (!data.timestamp) return;

        const date = data.timestamp
          .toDate()
          .toISOString()
          .split("T")[0];

        viewMap[date] = (viewMap[date] || 0) + 1;
      });

      const chartData = Object.entries(viewMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14)
        .map(([date, views]) => ({
          date,
          views,
        }));

      setViews(chartData);
      setTotalViews(viewsSnapshot.size);

      // =========================
      // LOAD POSTS
      // =========================

      const postsQuery = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc"),
        limit(10)
      );

      const postsSnapshot = await getDocs(postsQuery);

      const postData = postsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Post[];

      setPosts(postData);
    } catch (error) {
      console.error("Dashboard error:", error);
    }

    setLoading(false);
  };

  const publishedPosts = posts.filter(
    (post) => post.published
  ).length;

  const draftPosts = posts.filter(
    (post) => !post.published
  ).length;

  const handleDeletePost = async (postId: string) => {
    const confirmed = window.confirm("Bạn có chắc chắn muốn xóa bài viết này?");

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "posts", postId));
      setPosts((currentPosts) =>
        currentPosts.filter((post) => post.id !== postId)
      );
    } catch (error) {
      console.error("Delete post error:", error);
      alert("Không thể xóa bài viết.");
    }
  };

  if (loading) {
    return (
      <div className="admin-loading">
        LOADING DASHBOARD...
      </div>
    );
  }

  return (
    <div className="admin-page">

      {/* HEADER */}

      <header className="admin-header">
        <div>
          <p className="section-label">
            FPT PT ROBOTICS · ADMIN
          </p>

          <h1>
            DASH
            <br />
            <span>BOARD.</span>
          </h1>
        </div>

        <a href="/" className="admin-back">
          ← BACK TO WEBSITE
        </a>
      </header>


      {/* STATS */}

      <section className="admin-stats">

        <div className="admin-stat">
          <span>TOTAL VIEWS</span>
          <strong>{totalViews}</strong>
        </div>

        <div className="admin-stat">
          <span>PUBLISHED POSTS</span>
          <strong>{publishedPosts}</strong>
        </div>

        <div className="admin-stat">
          <span>DRAFTS</span>
          <strong>{draftPosts}</strong>
        </div>

      </section>


      {/* VIEWS CHART */}

      <section className="admin-chart-section">

        <div className="admin-section-heading">
          <div>
            <p className="section-label">
              ANALYTICS
            </p>

            <h2>
              WEBSITE
              <br />
              <span>TRAFFIC.</span>
            </h2>
          </div>

          <p>
            Page views during the last 14 days.
          </p>
        </div>

        <div className="chart-box">

          {views.length === 0 ? (
            <div className="chart-empty">
              NO VISIT DATA YET.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={views}>

                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#333"
                />

                <XAxis
                  dataKey="date"
                  stroke="#777"
                />

                <YAxis
                  stroke="#777"
                />

                <Tooltip />

                <Line
                  type="monotone"
                  dataKey="views"
                  strokeWidth={2}
                  dot={false}
                />

              </LineChart>
            </ResponsiveContainer>
          )}

        </div>

      </section>


      {/* BAR CHART */}

      <section className="admin-chart-section">

        <div className="admin-section-heading">

          <div>
            <p className="section-label">
              PERFORMANCE
            </p>

            <h2>
              DAILY
              <br />
              <span>VIEWS.</span>
            </h2>
          </div>

        </div>

        <div className="chart-box">

          {views.length === 0 ? (
            <div className="chart-empty">
              NO DATA.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={views}>

                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#333"
                />

                <XAxis
                  dataKey="date"
                  stroke="#777"
                />

                <YAxis
                  stroke="#777"
                />

                <Tooltip />

                <Bar
                  dataKey="views"
                  fill="currentColor"
                />

              </BarChart>
            </ResponsiveContainer>
          )}

        </div>

      </section>


      {/* POSTS */}

      <section className="admin-posts">

        <div className="admin-section-heading">

          <div>
            <p className="section-label">
              CONTENT
            </p>

            <h2>
              RECENT
              <br />
              <span>POSTS.</span>
            </h2>
          </div>

          <a
            href="/admin/posts/create"
            className="admin-create-button"
          >
            + CREATE POST
          </a>

        </div>


        <div className="admin-post-list">

          {posts.length === 0 ? (

            <div className="admin-no-posts">
              NO POSTS YET.
            </div>

          ) : (

            posts.map((post) => (

              <div
                className="admin-post"
                key={post.id}
              >

                <div>

                  <h3>
                    {post.title}
                  </h3>

                  <span>
                    {post.published
                      ? "PUBLISHED"
                      : "DRAFT"}
                  </span>

                </div>

                <div className="admin-post-actions">

                  <a
                    href={`/admin/posts/edit/${post.id}`}
                  >
                    EDIT
                  </a>

                  <button onClick={() => handleDeletePost(post.id)}>
                    DELETE
                  </button>

                </div>

              </div>

            ))

          )}

        </div>

      </section>

    </div>
  );
}

export default Admin;