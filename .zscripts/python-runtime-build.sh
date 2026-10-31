#!/bin/bash

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/z/my-project}"
BUILD_DIR="${BUILD_DIR:?BUILD_DIR is required}"
PYTHON_VERSION="${PYTHON_VERSION:-3.12}"
NEXT_DIST_DIR="$BUILD_DIR/next-service-dist"
PYTHON_RUNTIME_DIR="$BUILD_DIR/python-runtime"
PYTHON_PACKAGES_DIR="$PYTHON_RUNTIME_DIR/site-packages"

has_python_sources() {
    find "$PROJECT_DIR" \
        \( -type d \( -name '.git' \
        -o -name '.next' \
        -o -name '.venv' \
        -o -name 'node_modules' \
        -o -name '__pycache__' \
        -o -name 'mini-services' \
        -o -name 'upload' \
        -o -name 'download' \
        \) -prune \) \
        -o -type f \( -name '*.py' -o -name '*.pyi' \) -print -quit | grep -q .
}

if ! has_python_sources \
    && [ ! -f "$PROJECT_DIR/requirements.txt" ] \
    && [ ! -f "$PROJECT_DIR/pyproject.toml" ]; then
    echo "ℹ️  未检测到 Python 源码或依赖清单，跳过 Python runtime 构建"
    exit 0
fi

if ! command -v uv >/dev/null 2>&1; then
    echo "❌ 检测到 Python 项目，但构建环境中没有 uv"
    exit 1
fi

echo "🐍 检…93414 tokens truncated…"neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}