FROM public.ecr.aws/lambda/python:3.9-x86_64
FROM public.ecr.aws/lambda/python:3.10-arm64

RUN /var/lang/bin/python -m pip install --upgrade pip
RUN python -m pip install amazon-textract-caller==0.0.25 --target "${LAMBDA_TASK_ROOT}"
RUN python -m pip install --force-reinstall boto3==1.24.70 --target "${LAMBDA_TASK_ROOT}"

# Copy function code
COPY app/* ${LAMBDA_TASK_ROOT}/

# Set the CMD to your handler (could also be done as a parameter override outside of the Dockerfile)
CMD [ "sync_main.lambda_handler" ]
