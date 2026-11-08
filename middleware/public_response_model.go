package middleware

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// PublicResponseModel makes relay responses report the model the client requested instead
// of the name the upstream returned, for plain and streamed HTTP responses alike. The
// requested model is read when the response is written, so this can run before Distribute.
// JavaRouters fork addition; the Responses WebSocket path applies the same rewrite itself.
func PublicResponseModel() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer = &publicModelWriter{ResponseWriter: c.Writer, c: c}
		c.Next()
	}
}

type publicModelWriter struct {
	gin.ResponseWriter
	c *gin.Context
}

func (w *publicModelWriter) model() string {
	return common.GetContextKeyString(w.c, constant.ContextKeyOriginalModel)
}

// dropContentLength removes a length set for the upstream body, which a rewrite can change;
// the response is then sent with chunked encoding.
func (w *publicModelWriter) dropContentLength() {
	if !w.ResponseWriter.Written() && w.model() != "" {
		w.ResponseWriter.Header().Del("Content-Length")
	}
}

func (w *publicModelWriter) WriteHeader(code int) {
	w.dropContentLength()
	w.ResponseWriter.WriteHeader(code)
}

func (w *publicModelWriter) WriteHeaderNow() {
	w.dropContentLength()
	w.ResponseWriter.WriteHeaderNow()
}

// Write reports len(data) on success because callers such as io.Copy treat a different
// count as a short write.
func (w *publicModelWriter) Write(data []byte) (int, error) {
	w.dropContentLength()
	if _, err := w.ResponseWriter.Write(service.PublicResponseModel(data, w.model())); err != nil {
		return 0, err
	}
	return len(data), nil
}

func (w *publicModelWriter) WriteString(s string) (int, error) {
	return w.Write([]byte(s))
}

func (w *publicModelWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}
