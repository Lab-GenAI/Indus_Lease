#!/bin/bash
set -e
pip install -q -r python_requirements.txt 2>/dev/null || true
npm install --prefix client 2>/dev/null || true
