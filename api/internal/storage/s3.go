package storage

import (
	"context"
	"fmt"
	"io"
	"net/http"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Config struct {
	Endpoint  string
	Bucket    string
	AccessKey string
	SecretKey string
	UseSSL    bool
}

type Client struct {
	mc     *minio.Client
	bucket string
}

func New(cfg Config) (*Client, error) {
	mc, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("storage: connect: %w", err)
	}
	return &Client{mc: mc, bucket: cfg.Bucket}, nil
}

// EnsureBucket creates the bucket if it doesn't exist.
func (c *Client) EnsureBucket(ctx context.Context) error {
	exists, err := c.mc.BucketExists(ctx, c.bucket)
	if err != nil {
		return fmt.Errorf("storage: bucket check: %w", err)
	}
	if !exists {
		if err := c.mc.MakeBucket(ctx, c.bucket, minio.MakeBucketOptions{}); err != nil {
			return fmt.Errorf("storage: create bucket: %w", err)
		}
	}
	return nil
}

// PutObject stores an object and returns its key.
func (c *Client) PutObject(ctx context.Context, key string, reader io.Reader, size int64, contentType string) error {
	_, err := c.mc.PutObject(ctx, c.bucket, key, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return fmt.Errorf("storage: put %s: %w", key, err)
	}
	return nil
}

// GetObjectURL returns a direct URL to the stored object.
// For development with MinIO, this returns a path-style URL.
func (c *Client) GetObjectURL(key string) string {
	return fmt.Sprintf("/api/uploads/%s", key)
}

// ServeObject streams an object from S3 to an HTTP response.
func (c *Client) ServeObject(w http.ResponseWriter, r *http.Request, key string) {
	obj, err := c.mc.GetObject(r.Context(), c.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	defer obj.Close()

	info, err := obj.Stat()
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", info.ContentType)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	io.Copy(w, obj)
}
