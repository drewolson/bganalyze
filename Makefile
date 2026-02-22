.PHONY: build-frontend build run test test-go test-frontend

build-frontend:
	cd frontend && npm run build

build: build-frontend
	go build -o bganalyze .

run: build
	./bganalyze

test: test-go test-frontend

test-go:
	go test ./...

test-frontend:
	cd frontend && npm test
