import { useState } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

import { db, storage } from "../../firebase";

function CreatePost() {

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  const createPost = async () => {

    if (!title.trim()) {
      setErrorMessage("Vui lòng nhập tiêu đề.");
      setSaving(false);
      return;
    }

    if (!content.trim()) {
      setErrorMessage("Vui lòng nhập nội dung bài viết.");
      setSaving(false);
      return;
    }

    setErrorMessage("");
    setSaving(true);

    try {
      const imageUrls: string[] = [];

      if (selectedImages.length > 0) {
        const uploadPromises = selectedImages.map(async (file, index) => {
          const storageRef = ref(
            storage,
            `posts/${Date.now()}-${index}-${file.name}`
          );

          const snapshot = await uploadBytes(storageRef, file);
          return getDownloadURL(snapshot.ref);
        });

        const uploadedUrls = await Promise.all(uploadPromises);
        imageUrls.push(...uploadedUrls);
      }

      await addDoc(collection(db, "posts"), {
        title: title.trim(),
        content,
        published,
        imageUrls,
        imageUrl: imageUrls[0] || "",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      alert(
        published
          ? "Đã đăng bài!"
          : "Đã lưu bản nháp!"
      );

      window.location.href = "/admin";

    } catch (error) {
      console.error("Create post error:", error);
      setErrorMessage(
        "Không thể lưu bài viết. Hãy kiểm tra Firebase Storage/Firestore permissions hoặc kết nối mạng."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="post-editor">

      <div className="post-editor-header">

        <div>

          <p className="section-label">
            FPT PT ROBOTICS · CONTENT
          </p>

          <h1>
            CREATE
            <br />
            <span>POST.</span>
          </h1>

        </div>

        <a href="/admin">
          ← DASHBOARD
        </a>

      </div>


      <div className="post-form">

        <label>
          TITLE
        </label>

        <input
          value={title}
          onChange={(e) =>
            setTitle(e.target.value)
          }
          placeholder="Enter post title..."
        />


        <label>
          IMAGES (OPTIONAL)
        </label>

        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            setSelectedImages(files);

            setImagePreviewUrls(files.map((file) => URL.createObjectURL(file)));
          }}
        />

        {imagePreviewUrls.length > 0 && (
          <div className="post-image-preview-grid">
            {imagePreviewUrls.map((url, index) => (
              <img
                key={`${url}-${index}`}
                src={url}
                alt={`Post preview ${index + 1}`}
                className="post-image-preview"
              />
            ))}
          </div>
        )}

        <label>
          CONTENT
        </label>

        <textarea
          value={content}
          onChange={(e) =>
            setContent(e.target.value)
          }
          placeholder="Write your article..."
          rows={18}
        />


        {errorMessage && (
          <p className="login-error">{errorMessage}</p>
        )}

        <label className="publish-toggle">

          <input
            type="checkbox"
            checked={published}
            onChange={(e) =>
              setPublished(e.target.checked)
            }
          />

          <span>
            PUBLISH IMMEDIATELY
          </span>

        </label>


        <div className="post-form-actions">

          <button
            onClick={createPost}
            disabled={saving}
          >
            {saving
              ? "SAVING..."
              : published
                ? "PUBLISH POST →"
                : "SAVE DRAFT →"}
          </button>

        </div>

      </div>

    </div>
  );
}

export default CreatePost;