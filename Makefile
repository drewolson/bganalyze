.PHONY: build-frontend build run test test-go test-frontend clean

frontend/node_modules: frontend/package-lock.json
	cd frontend && npm install
	@touch frontend/node_modules

build-frontend: frontend/node_modules
	cd frontend && npm run build

build: build-frontend
	go build ./backend/cmd/bganalyze

run: build
	./bganalyze

test: test-frontend test-go

test-go:
	go test ./...

test-frontend:
	cd frontend && npm test

clean:
	rm -rf frontend/node_modules frontend/dist bganalyze
