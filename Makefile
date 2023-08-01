dev:
	npm run start

deploy:
	rm -rf dist
	npm run build
	ansible-playbook -i deployment/inventory deployment/myaws.yml